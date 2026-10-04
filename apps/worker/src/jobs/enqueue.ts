import type { TaskRow } from '@intelligo/shared';
import type { PgBoss } from 'pg-boss';
import { bossPriority, QUEUES } from '../queues';

/** One active run per agent (singletonKey = agent id); priority 1 is picked first. */
export async function enqueueRun(
  boss: PgBoss,
  task: Pick<TaskRow, 'id' | 'priority'>,
  agentId: string,
  resume = false,
): Promise<void> {
  await boss.send(
    QUEUES.runTask,
    resume ? { taskId: task.id, agentId, resume: true } : { taskId: task.id, agentId },
    { singletonKey: agentId, priority: bossPriority(task.priority) },
  );
}

export async function enqueueRoute(
  boss: PgBoss,
  task: Pick<TaskRow, 'id' | 'priority'>,
): Promise<void> {
  await boss.send(QUEUES.routeTask, { taskId: task.id }, { priority: bossPriority(task.priority) });
}

export async function enqueueReview(
  boss: PgBoss,
  task: Pick<TaskRow, 'id' | 'priority'>,
): Promise<void> {
  await boss.send(
    QUEUES.reviewTask,
    { taskId: task.id },
    { priority: bossPriority(task.priority) },
  );
}
