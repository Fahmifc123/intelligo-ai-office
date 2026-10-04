import { canTransition, TaskRow, type TaskStatus } from '@intelligo/shared';
import type { Queryable } from '../lib/db';

const TASK_COLUMNS = `id, org_id, title, instructions, requested_by, assignee_id, assign_mode, parent_task_id,
  status, priority, result_text, result_json, revision_count, error, created_at, started_at, finished_at`;

export async function loadTask(q: Queryable, taskId: string): Promise<TaskRow | undefined> {
  const result = await q.query(`select ${TASK_COLUMNS} from public.tasks where id = $1`, [taskId]);
  return result.rows[0] ? TaskRow.parse(result.rows[0]) : undefined;
}

export interface TaskPatch {
  assigneeId?: string | null;
  resultText?: string | null;
  /** Shallow-merged into result_json. */
  resultJson?: Record<string, unknown>;
  revisionCount?: number;
  error?: string | null;
  started?: boolean;
  finished?: boolean;
}

export class TransitionError extends Error {}

/**
 * Moves a task from one of `from` to `to` atomically (compare-and-set on status).
 * Returns the updated row, or undefined if the task was no longer in an expected status
 * (e.g. cancelled meanwhile). Invalid lifecycle edges throw.
 */
export async function transitionTask(
  q: Queryable,
  taskId: string,
  from: readonly TaskStatus[],
  to: TaskStatus,
  patch: TaskPatch = {},
): Promise<TaskRow | undefined> {
  for (const status of from) {
    if (!canTransition(status, to))
      throw new TransitionError(`Transisi ${status} -> ${to} tidak diizinkan`);
  }
  const result = await q.query(
    `update public.tasks set
       status = $3,
       assignee_id = case when $4::boolean then $5 else assignee_id end,
       result_text = case when $6::boolean then $7 else result_text end,
       result_json = case when $8::jsonb is null then result_json else coalesce(result_json, '{}'::jsonb) || $8::jsonb end,
       revision_count = coalesce($9, revision_count),
       error = case when $10::boolean then $11 else error end,
       started_at = case when $12::boolean then coalesce(started_at, now()) else started_at end,
       finished_at = case when $13::boolean then now() else finished_at end
     where id = $1 and status = any($2::task_status[])
     returning ${TASK_COLUMNS}`,
    [
      taskId,
      from,
      to,
      patch.assigneeId !== undefined,
      patch.assigneeId ?? null,
      patch.resultText !== undefined,
      patch.resultText ?? null,
      patch.resultJson ? JSON.stringify(patch.resultJson) : null,
      patch.revisionCount ?? null,
      patch.error !== undefined,
      patch.error ?? null,
      patch.started ?? false,
      patch.finished ?? false,
    ],
  );
  return result.rows[0] ? TaskRow.parse(result.rows[0]) : undefined;
}

/** Streams partial output into result_text while the task is still running. */
export async function writePartialResult(
  q: Queryable,
  taskId: string,
  text: string,
): Promise<void> {
  await q.query(
    `update public.tasks set result_text = $2 where id = $1 and status = 'in_progress'`,
    [taskId, text],
  );
}

export async function appendDraft(
  q: Queryable,
  taskId: string,
  draft: Record<string, unknown>,
): Promise<number> {
  const result = await q.query<{ count: number }>(
    `update public.tasks
        set result_json = jsonb_set(coalesce(result_json, '{}'::jsonb), '{drafts}',
          coalesce(result_json -> 'drafts', '[]'::jsonb) || jsonb_build_array($2::jsonb))
      where id = $1
      returning jsonb_array_length(result_json -> 'drafts') as count`,
    [taskId, JSON.stringify(draft)],
  );
  return result.rows[0]?.count ?? 0;
}

export async function currentStatus(q: Queryable, taskId: string): Promise<TaskStatus | undefined> {
  const result = await q.query<{ status: TaskStatus }>(
    'select status from public.tasks where id = $1',
    [taskId],
  );
  return result.rows[0]?.status;
}
