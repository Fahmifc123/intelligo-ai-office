import { AgentActivity } from '@intelligo/shared';
import { z } from 'zod';
import type { Queryable } from '../lib/db';

export const RosterEntry = z.object({
  agent_id: z.string(),
  name: z.string(),
  role: z.string(),
  is_manager: z.boolean(),
  enabled: z.boolean(),
  idle_lines: z.array(z.string()),
  activity: AgentActivity,
  status_text: z.string(),
  current_task_id: z.string().nullable(),
  target_spot: z.string().nullable(),
});
export type RosterEntry = z.infer<typeof RosterEntry>;

/** Agents joined with their live state, ordered by id for deterministic planning. */
export async function readRoster(q: Queryable, orgId: string): Promise<RosterEntry[]> {
  const result = await q.query(
    `select a.id as agent_id, a.name, a.role, a.is_manager, a.enabled, a.idle_lines,
            s.activity, s.status_text, s.current_task_id, s.target_spot
       from public.agents a
       join public.agent_states s on s.agent_id = a.id
      where a.org_id = $1
      order by a.id`,
    [orgId],
  );
  return result.rows.map((row) => RosterEntry.parse(row));
}

/** An agent is "free" when it has no task and is not on a review walk. */
export function isFree(entry: RosterEntry): boolean {
  return (
    entry.enabled &&
    entry.current_task_id === null &&
    entry.activity !== 'walking_to_review' &&
    entry.activity !== 'reviewing' &&
    entry.activity !== 'offline'
  );
}
