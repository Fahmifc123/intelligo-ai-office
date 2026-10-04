import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

export const QUEUES = {
  routeTask: 'route-task',
  runTask: 'run-task',
  reviewTask: 'review-task',
  executeAction: 'execute-action',
  idleTick: 'idle-tick',
} as const;

export const TaskJob = z.object({ taskId: z.guid() });
export type TaskJob = z.infer<typeof TaskJob>;

export const RunTaskJob = z.object({ taskId: z.guid(), agentId: z.string() });
export type RunTaskJob = z.infer<typeof RunTaskJob>;

export const ActionJob = z.object({ actionId: z.guid() });
export type ActionJob = z.infer<typeof ActionJob>;

/** pg-boss: higher number runs first. Task priority 1 (tinggi) maps to 3. */
export const bossPriority = (taskPriority: number): number => 4 - taskPriority;

/**
 * Queue policies (SPEC section 9):
 * - run-task: `singleton` keyed by agent_id, one active task per agent, the rest wait in line.
 * - review-task: `singleton` without a key, the manager reviews one task at a time.
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.routeTask, { retryLimit: 0, notify: true });
  await boss.createQueue(QUEUES.runTask, {
    policy: 'singleton',
    retryLimit: 0,
    expireInSeconds: 6 * 60,
    notify: true,
  });
  await boss.createQueue(QUEUES.reviewTask, {
    policy: 'singleton',
    retryLimit: 0,
    expireInSeconds: 3 * 60,
    notify: true,
  });
  await boss.createQueue(QUEUES.executeAction, {
    retryLimit: 0,
    expireInSeconds: 2 * 60,
    notify: true,
  });
  await boss.createQueue(QUEUES.idleTick, { retryLimit: 0, expireInSeconds: 60 });
}
