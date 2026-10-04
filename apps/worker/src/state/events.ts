import type { TaskEventType } from '@intelligo/shared';
import type { Queryable } from '../lib/db';

export interface NewTaskEvent {
  orgId: string;
  taskId: string | null;
  agentId: string | null;
  type: TaskEventType;
  payload?: Record<string, unknown>;
}

/** Appends one row to task_events (timeline + activity feed). */
export async function logEvent(q: Queryable, event: NewTaskEvent): Promise<void> {
  await q.query(
    `insert into public.task_events (org_id, task_id, agent_id, type, payload)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [event.orgId, event.taskId, event.agentId, event.type, JSON.stringify(event.payload ?? {})],
  );
}
