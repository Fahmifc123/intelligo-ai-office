import type { WorkerEnv } from '@intelligo/shared';
import type { PgBoss } from 'pg-boss';
import { Dispatcher, type DispatchNotification } from './dispatcher';
import type { Db } from './lib/db';
import type { HealthState } from './lib/health';
import type { Logger } from './lib/log';
import { applyOfficeMode, runIdleTick } from './office/office';
import type { OfficeModeName, Rng } from './office/plan';
import { ensureQueues, QUEUES } from './queues';

export const IDLE_TICK_MS = 20_000;

export interface WorkerDeps {
  env: WorkerEnv;
  db: Db;
  boss: PgBoss;
  log: Logger;
  rng: Rng;
  health: HealthState;
}

export interface RunningWorker {
  stop(): Promise<void>;
}

/** Registers jobs, the dispatcher, and timers. pg-boss must already be started. */
export async function startWorker(deps: WorkerDeps): Promise<RunningWorker> {
  const { env, db, boss, log, rng } = deps;
  const orgId = env.ORG_ID;
  await ensureQueues(boss);

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
      log.info(
        {
          changed: result.changed,
          meeting: result.mode.meetingActive,
          break: result.mode.breakMode,
        },
        'mode kantor diterapkan',
      );
  };

  await boss.work(QUEUES.idleTick, async () => {
    const changed = await runIdleTick(db, orgId, rng);
    log.debug({ changed }, 'idle-tick');
  });

  const dispatcher = new Dispatcher(db, log, {
    onNotification: async (notification: DispatchNotification) => {
      if (notification.kind === 'office') await syncOfficeMode();
    },
    sweep: async () => {
      await syncOfficeMode();
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
    async stop() {
      if (idleTimer) clearInterval(idleTimer);
      if (meetingTimer) clearTimeout(meetingTimer);
      await dispatcher.stop();
    },
  };
}
