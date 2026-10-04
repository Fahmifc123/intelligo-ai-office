import { z } from 'zod';
import type { JobDeps } from './deps';
import { enqueueReview, enqueueRoute, enqueueRun } from './enqueue';

const Claimed = z.object({
  id: z.string(),
  priority: z.number(),
  assign_mode: z.enum(['auto', 'manual']),
  assignee_id: z.string().nullable(),
});

/**
 * Claims a newly inserted task (dispatched_at) and enqueues its first job. Safe to call twice:
 * only the first caller wins the claim.
 */
export async function dispatchTask(deps: JobDeps, taskId: string): Promise<boolean> {
  const result = await deps.db.query(
    `update public.tasks set dispatched_at = now()
      where id = $1 and status = 'queued' and dispatched_at is null
      returning id::text, priority, assign_mode, assignee_id`,
    [taskId],
  );
  const row = result.rows[0];
  if (!row) return false;
  const task = Claimed.parse(row);
  try {
    if (task.assign_mode === 'auto' && task.assignee_id === null)
      await enqueueRoute(deps.boss, task);
    else if (task.assignee_id) await enqueueRun(deps.boss, task, task.assignee_id);
    return true;
  } catch (error) {
    // Release the claim so the next sweep retries.
    await deps.db.query('update public.tasks set dispatched_at = null where id = $1', [taskId]);
    throw error;
  }
}

/** Catch-up for tasks whose notification was missed (worker offline, connection drop). */
export async function sweepTasks(deps: JobDeps): Promise<number> {
  const result = await deps.db.query<{ id: string }>(
    `select id::text from public.tasks where status = 'queued' and dispatched_at is null order by priority, created_at limit 50`,
  );
  let count = 0;
  for (const row of result.rows) if (await dispatchTask(deps, row.id)) count += 1;
  return count;
}

/**
 * After a restart, work that was mid-flight has no live job any more: put routing / running
 * tasks back in the queue and re-enqueue pending reviews.
 */
export async function recoverInterruptedWork(deps: JobDeps, orgId: string): Promise<number> {
  const { db } = deps;
  const interrupted = await db.tx(async (q) => {
    const tasks = await q.query<{ id: string }>(
      `update public.tasks set status = 'queued', dispatched_at = null
        where org_id = $1 and status in ('routing', 'in_progress')
        returning id::text`,
      [orgId],
    );
    if (tasks.rows.length > 0) {
      const ids = tasks.rows.map((r) => r.id);
      await q.query(
        `update public.agent_states set current_task_id = null, activity = 'working', target_spot = 'desk', status_text = 'Melanjutkan tugas'
          where current_task_id = any($1::uuid[])`,
        [ids],
      );
      await q.query(
        `insert into public.task_events (org_id, task_id, type, payload)
         select $1, id, 'note', jsonb_build_object('message', 'Tugas diantrekan ulang setelah worker restart')
           from unnest($2::uuid[]) as id`,
        [orgId, ids],
      );
    }
    // The manager may have been mid-walk.
    await q.query(
      `update public.agent_states set activity = 'working', target_spot = 'desk', status_text = 'Balik ke meja'
        where org_id = $1 and activity in ('walking_to_review', 'reviewing')`,
      [orgId],
    );
    return tasks.rows.length;
  });
  const reviews = await db.query<{ id: string; priority: number }>(
    `select id::text, priority from public.tasks where org_id = $1 and status = 'awaiting_review'`,
    [orgId],
  );
  for (const task of reviews.rows) await enqueueReview(deps.boss, task);
  return interrupted;
}
