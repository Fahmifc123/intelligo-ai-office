import { parsePricingOverrides, type WorkerEnv } from '@intelligo/shared';
import type { Job, PgBoss } from 'pg-boss';
import type { z } from 'zod';
import { Dispatcher, type DispatchNotification } from './dispatcher';
import type { JobDeps } from './jobs/deps';
import { handleActionDecision, handleExecuteAction, sweepActions } from './jobs/actions';
import {
  dispatchTask,
  recordCancellation,
  recoverInterruptedWork,
  sweepTasks,
} from './jobs/dispatch';
import { handleReviewTask } from './jobs/review-task';
import { handleRouteTask } from './jobs/route-task';
import { handleRunTask } from './jobs/run-task';
import type { Db } from './lib/db';
import type { HealthState } from './lib/health';
import type { Logger } from './lib/log';
import type { LlmClient } from './llm/types';
import { applyOfficeMode, runIdleTick } from './office/office';
import type { OfficeModeName, Rng } from './office/plan';
import { ActionJob, ensureQueues, QUEUES, RunTaskJob, TaskJob } from './queues';

export const IDLE_TICK_MS = 20_000;

export interface WorkerDeps {
  env: WorkerEnv;
  db: Db;
  boss: PgBoss;
  log: Logger;
  rng: Rng;
  llm: LlmClient;
  health: HealthState;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunningWorker {
  deps: JobDeps;
  stop(): Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Registers jobs, the dispatcher, and timers. pg-boss must already be started. */
export async function startWorker(deps: WorkerDeps): Promise<RunningWorker> {
  const { env, db, boss, log, rng, health } = deps;
  const orgId = env.ORG_ID;
  const jobDeps: JobDeps = {
    db,
    boss,
    llm: deps.llm,
    env,
    log,
    prices: parsePricingOverrides(env.MODEL_PRICING_JSON),
    sleep: deps.sleep ?? realSleep,
  };
  await ensureQueues(boss);

  /** Wraps a handler: validates job data, tracks consecutive failures for the health check. */
  const work = <T>(
    name: string,
    schema: z.ZodType<T>,
    handler: (data: T) => Promise<void>,
    localConcurrency: number,
  ) =>
    boss.work(name, { localConcurrency, batchSize: 1 }, async (jobs: Job<unknown>[]) => {
      for (const job of jobs) {
        try {
          await handler(schema.parse(job.data));
          health.consecutiveFailures.set(name, 0);
          health.lastJobAt = new Date();
        } catch (error) {
          const failures = (health.consecutiveFailures.get(name) ?? 0) + 1;
          health.consecutiveFailures.set(name, failures);
          const level = failures > 3 ? 'error' : 'warn';
          log[level](
            {
              job: name,
              jobId: job.id,
              failures,
              err: error instanceof Error ? error.message : String(error),
            },
            'job gagal',
          );
          throw error;
        }
      }
    });

  await work(QUEUES.routeTask, TaskJob, (data) => handleRouteTask(jobDeps, data), 4);
  await work(QUEUES.runTask, RunTaskJob, (data) => handleRunTask(jobDeps, data), 12);
  await work(QUEUES.reviewTask, TaskJob, (data) => handleReviewTask(jobDeps, data), 1);
  await work(QUEUES.executeAction, ActionJob, (data) => handleExecuteAction(jobDeps, data), 4);

  let meetingTimer: NodeJS.Timeout | undefined;
  let lastMode: OfficeModeName | null = null;
  const syncOfficeMode = async (): Promise<void> => {
    const result = await applyOfficeMode(db, orgId, rng, lastMode);
    lastMode = result.name;
    if (meetingTimer) clearTimeout(meetingTimer);
    meetingTimer = undefined;
    if (result.mode.meetingUntil && result.mode.meetingActive) {
      const delay = Math.max(0, result.mode.meetingUntil.getTime() - Date.now()) + 50;
      meetingTimer = setTimeout(
        () =>
          void syncOfficeMode().catch((error: unknown) =>
            log.error({ err: String(error) }, 'gagal mengakhiri rapat'),
          ),
        delay,
      );
    }
    if (result.changed > 0)
      log.info({ changed: result.changed, mode: result.name }, 'mode kantor diterapkan');
  };

  await boss.work(QUEUES.idleTick, async () => {
    const changed = await runIdleTick(db, orgId, rng);
    log.debug({ changed }, 'idle-tick');
  });

  const recovered = await recoverInterruptedWork(jobDeps, orgId);
  if (recovered > 0) log.info({ recovered }, 'tugas yang terputus diantrekan ulang');

  const dispatcher = new Dispatcher(db, log, {
    onNotification: async (notification: DispatchNotification) => {
      switch (notification.kind) {
        case 'office':
          await syncOfficeMode();
          break;
        case 'task':
          await dispatchTask(jobDeps, notification.id);
          break;
        case 'task_cancelled':
          await recordCancellation(jobDeps, notification.id);
          break;
        case 'action':
          await handleActionDecision(jobDeps, notification.id);
          break;
      }
    },
    sweep: async () => {
      await syncOfficeMode();
      await sweepTasks(jobDeps);
      await sweepActions(jobDeps);
    },
  });
  await dispatcher.start();

  const sendIdleTick = (): void => {
    boss
      .send(QUEUES.idleTick, {}, { singletonSeconds: Math.floor(IDLE_TICK_MS / 1000) - 2 })
      .catch((error: unknown) => {
        log.error({ err: String(error) }, 'gagal mengirim idle-tick');
      });
  };
  const idleTimer = env.IDLE_TICK_ENABLED ? setInterval(sendIdleTick, IDLE_TICK_MS) : undefined;

  return {
    deps: jobDeps,
    async stop() {
      if (idleTimer) clearInterval(idleTimer);
      if (meetingTimer) clearTimeout(meetingTimer);
      await dispatcher.stop();
    },
  };
}
