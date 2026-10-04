import type { AgentActivity, AgentStateRow, TargetSpot, TaskEventType } from '@intelligo/shared';
import { AgentStateRow as AgentStateRowSchema } from '@intelligo/shared';
import type { Queryable } from '../lib/db';
import { logEvent } from './events';

export interface AgentStateChange {
  orgId: string;
  agentId: string;
  activity: AgentActivity;
  statusText: string;
  /** undefined keeps the current task, null clears it. */
  currentTaskId?: string | null;
  targetSpot: TargetSpot;
  /** Event written alongside the state change (SPEC section 9). */
  event: {
    taskId?: string | null;
    type: TaskEventType;
    payload?: Record<string, unknown>;
  };
}

/** Updates agent_states and writes one task_events row in the same transaction scope. */
export async function setAgentState(q: Queryable, change: AgentStateChange): Promise<void> {
  const keepTask = change.currentTaskId === undefined;
  await q.query(
    `update public.agent_states
       set activity = $3,
           status_text = $4,
           current_task_id = case when $5::boolean then current_task_id else $6::uuid end,
           target_spot = $7
     where agent_id = $1 and org_id = $2`,
    [
      change.agentId,
      change.orgId,
      change.activity,
      change.statusText,
      keepTask,
      keepTask ? null : change.currentTaskId,
      change.targetSpot,
    ],
  );
  await logEvent(q, {
    orgId: change.orgId,
    taskId: change.event.taskId ?? null,
    agentId: change.agentId,
    type: change.event.type,
    payload: {
      activity: change.activity,
      status_text: change.statusText,
      ...change.event.payload,
    },
  });
}

export async function readAgentStates(q: Queryable, orgId: string): Promise<AgentStateRow[]> {
  const result = await q.query(
    `select agent_id, org_id, activity, status_text, current_task_id, target_spot, created_at, updated_at
       from public.agent_states where org_id = $1 order by agent_id`,
    [orgId],
  );
  return result.rows.map((row) => AgentStateRowSchema.parse(row));
}

export async function readAgentState(
  q: Queryable,
  orgId: string,
  agentId: string,
): Promise<AgentStateRow | undefined> {
  const result = await q.query(
    `select agent_id, org_id, activity, status_text, current_task_id, target_spot, created_at, updated_at
       from public.agent_states where org_id = $1 and agent_id = $2`,
    [orgId, agentId],
  );
  const row = result.rows[0];
  return row ? AgentStateRowSchema.parse(row) : undefined;
}
