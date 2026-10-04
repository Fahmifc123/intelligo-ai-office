import { TaskRow } from '@intelligo/shared';
import { z } from 'zod';
import type { RunnerState } from '../agent/runner';
import type { SubtaskSummary } from '../agent/prompts';
import type { Queryable } from '../lib/db';
import type { LlmMessageParam } from '../llm/types';
import { loadTask } from '../state/tasks';
import type { JobDeps } from './deps';
import { enqueueRun } from './enqueue';

const TERMINAL = ['done', 'failed', 'cancelled'];

const WaitingJson = z.object({ waiting_on: z.array(z.string()).min(1) });

const StoredState = z.object({
  steps: z.number().int().nonnegative(),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.unknown() })),
});

/** Saved conversation of a suspended run (thinking blocks are kept exactly as returned). */
export function parseRunnerState(resultJson: unknown): RunnerState | undefined {
  const state = StoredState.safeParse(
    (resultJson as { runner_state?: unknown } | null)?.runner_state,
  );
  if (!state.success) return undefined;
  return { steps: state.data.steps, messages: state.data.messages as LlmMessageParam[] };
}

/**
 * Atomically takes a waiting parent for resumption: clears waiting_on so a second resume job
 * (two subtasks finishing together) becomes a no-op.
 */
export async function claimResume(q: Queryable, taskId: string): Promise<TaskRow | undefined> {
  const result = await q.query(
    `update public.tasks set result_json = result_json - 'waiting_on'
      where id = $1 and status = 'in_progress' and result_json ? 'waiting_on'
      returning id, org_id, title, instructions, requested_by, assignee_id, assign_mode, parent_task_id,
        status, priority, result_text, result_json, revision_count, error, created_at, started_at, finished_at`,
    [taskId],
  );
  return result.rows[0] ? TaskRow.parse(result.rows[0]) : undefined;
}

const Child = z.object({
  title: z.string(),
  status: z.string(),
  result_text: z.string().nullable(),
  error: z.string().nullable(),
  result_json: z.unknown(),
  agent_name: z.string().nullable(),
});

/** Results of a parent's subtasks, for the manager's next turn. */
export async function subtaskSummaries(q: Queryable, parentId: string): Promise<SubtaskSummary[]> {
  const result = await q.query(
    `select t.title, t.status, t.result_text, t.error, t.result_json, a.name as agent_name
       from public.tasks t left join public.agents a on a.id = t.assignee_id
      where t.parent_task_id = $1 order by t.created_at`,
    [parentId],
  );
  return result.rows.map((row) => {
    const child = Child.parse(row);
    const docs = z
      .object({ documents: z.array(z.object({ title: z.string(), url: z.string() })) })
      .safeParse(child.result_json);
    const links = docs.success
      ? `\n\nDokumen: ${docs.data.documents.map((d) => `${d.title} ${d.url}`).join(', ')}`
      : '';
    return {
      title: child.title,
      agentName: child.agent_name ?? '?',
      status: child.status,
      result: `${(child.result_text ?? child.error ?? '(tanpa hasil)').slice(0, 4000)}${links}`,
    };
  });
}

/** Resumes the parent once every subtask it waits for is done, failed, or cancelled. */
export async function resumeParentIfReady(deps: JobDeps, parentId: string): Promise<boolean> {
  const parent = await loadTask(deps.db, parentId);
  if (!parent || parent.status !== 'in_progress' || !parent.assignee_id) return false;
  const waiting = WaitingJson.safeParse(parent.result_json);
  if (!waiting.success) return false;
  const open = await deps.db.query<{ n: number }>(
    `select count(*)::int as n from public.tasks where id = any($1::uuid[]) and status <> all($2::task_status[])`,
    [waiting.data.waiting_on, TERMINAL],
  );
  if ((open.rows[0]?.n ?? 1) > 0) return false;
  await enqueueRun(deps.boss, parent, parent.assignee_id, true);
  return true;
}

/** Called whenever a task reaches a final status. */
export async function onSubtaskSettled(deps: JobDeps, childId: string): Promise<void> {
  const child = await loadTask(deps.db, childId);
  if (child?.parent_task_id) await resumeParentIfReady(deps, child.parent_task_id);
}

/** Catch-up after a restart or a missed event. */
export async function sweepWaitingParents(deps: JobDeps): Promise<void> {
  const result = await deps.db.query<{ id: string }>(
    `select id::text from public.tasks where status = 'in_progress' and result_json ? 'waiting_on' limit 50`,
  );
  for (const row of result.rows) await resumeParentIfReady(deps, row.id);
}
