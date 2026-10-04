import {
  ACTION_KIND_LABELS,
  ActionRow,
  AUTO_APPROVABLE_KINDS,
  maskPii,
  N8N_WORKFLOWS,
  payloadDiff,
  type ActionKind,
} from '@intelligo/shared';
import type { Queryable } from '../lib/db';
import { callN8n, N8nConfigError } from '../lib/n8n';
import { QUEUES, type ActionJob } from '../queues';
import { logEvent } from '../state/events';
import { loadTask, transitionTask } from '../state/tasks';
import type { JobDeps } from './deps';

const ACTION_COLUMNS = `id, org_id, task_id, agent_id, kind, payload, status, approved_by, approved_at, executed_at,
  response, created_at, original_payload, rejected_by, rejected_at, error`;

export async function loadAction(q: Queryable, actionId: string): Promise<ActionRow | undefined> {
  const result = await q.query(`select ${ACTION_COLUMNS} from public.actions where id = $1`, [
    actionId,
  ]);
  return result.rows[0] ? ActionRow.parse(result.rows[0]) : undefined;
}

async function memberEmail(q: Queryable, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const result = await q.query<{ email: string }>(
    'select email from public.org_members where user_id = $1',
    [userId],
  );
  return result.rows[0]?.email ?? null;
}

/** Effective dry-run: the env flag forces it; the Owner can also switch it on in /settings. */
async function isDryRun(deps: JobDeps, orgId: string): Promise<boolean> {
  if (deps.env.DRY_RUN) return true;
  const result = await deps.db.query<{ dry_run: boolean }>(
    'select dry_run from public.settings where org_id = $1',
    [orgId],
  );
  return result.rows[0]?.dry_run ?? true;
}

/** Claims an approved action and queues its execution (one job per action). */
export async function dispatchAction(deps: JobDeps, actionId: string): Promise<boolean> {
  const claimed = await deps.db.query<{ id: string }>(
    `update public.actions set dispatched_at = now()
      where id = $1 and status = 'approved' and dispatched_at is null returning id::text`,
    [actionId],
  );
  if (!claimed.rows[0]) return false;
  try {
    await deps.boss.send(QUEUES.executeAction, { actionId }, { singletonKey: actionId });
    return true;
  } catch (error) {
    await deps.db.query('update public.actions set dispatched_at = null where id = $1', [actionId]);
    throw error;
  }
}

export async function sweepActions(deps: JobDeps): Promise<void> {
  const result = await deps.db.query<{ id: string }>(
    `select id::text from public.actions where status = 'approved' and dispatched_at is null order by created_at limit 50`,
  );
  for (const row of result.rows) await dispatchAction(deps, row.id);
}

/**
 * When no action of a task is still waiting (proposed / approved), the task is finished:
 * failed if any action failed, done otherwise.
 */
export async function resolveTaskActions(deps: JobDeps, taskId: string): Promise<void> {
  const counts = await deps.db.query<{
    open: number;
    failed: number;
    failed_kinds: string[] | null;
  }>(
    `select count(*) filter (where status in ('proposed', 'approved'))::int as open,
            count(*) filter (where status = 'failed')::int as failed,
            array_agg(kind) filter (where status = 'failed') as failed_kinds
       from public.actions where task_id = $1`,
    [taskId],
  );
  const row = counts.rows[0];
  if (!row || row.open > 0) return;
  const from = ['awaiting_approval', 'executing'] as const;
  if (row.failed > 0) {
    const kinds = (row.failed_kinds ?? [])
      .map((k) => ACTION_KIND_LABELS[k as ActionKind] ?? k)
      .join(', ');
    const failed = await transitionTask(deps.db, taskId, from, 'failed', {
      error: `Aksi gagal dieksekusi: ${kinds}.`,
      finished: true,
    });
    if (failed) {
      await logEvent(deps.db, {
        orgId: failed.org_id,
        taskId,
        agentId: failed.assignee_id,
        type: 'failed',
        payload: { error: failed.error },
      });
    }
    return;
  }
  const done = await transitionTask(deps.db, taskId, from, 'done', { finished: true });
  if (done) {
    await logEvent(deps.db, {
      orgId: done.org_id,
      taskId,
      agentId: done.assignee_id,
      type: 'note',
      payload: { status: 'done' },
    });
  }
}

/**
 * Reacts to the web app approving or rejecting an action: writes the approval event (with the
 * edit diff), then queues execution or closes the task. Only the worker writes task_events.
 */
export async function handleActionDecision(deps: JobDeps, actionId: string): Promise<void> {
  const action = await loadAction(deps.db, actionId);
  if (!action || (action.status !== 'approved' && action.status !== 'rejected')) return;
  const already = await deps.db.query(
    `select 1 from public.task_events where type = 'approval' and payload ->> 'action_id' = $1 limit 1`,
    [action.id],
  );
  if (already.rows.length === 0) {
    const edited =
      action.original_payload !== null &&
      JSON.stringify(action.original_payload) !== JSON.stringify(action.payload);
    const actor = action.status === 'approved' ? action.approved_by : action.rejected_by;
    await logEvent(deps.db, {
      orgId: action.org_id,
      taskId: action.task_id,
      agentId: action.agent_id,
      type: 'approval',
      payload: {
        action_id: action.id,
        kind: action.kind,
        decision: action.status === 'rejected' ? 'rejected' : edited ? 'edited' : 'approved',
        actor_email: (await memberEmail(deps.db, actor)) ?? (actor ? null : 'otomatis'),
        auto: actor === null,
        ...(edited && action.original_payload
          ? { diff: payloadDiff(action.original_payload, action.payload) }
          : {}),
      },
    });
  }
  if (action.status === 'approved') await dispatchAction(deps, action.id);
  else await resolveTaskActions(deps, action.task_id);
}

/** Auto-approves proposed actions whose kind the Owner allowed in settings (never broadcasts). */
export async function autoApproveActions(
  deps: JobDeps,
  taskId: string,
  orgId: string,
): Promise<number> {
  const settings = await deps.db.query<{ kinds: string[] }>(
    'select auto_approve_kinds as kinds from public.settings where org_id = $1',
    [orgId],
  );
  const kinds = (settings.rows[0]?.kinds ?? []).filter((k) =>
    AUTO_APPROVABLE_KINDS.includes(k as ActionKind),
  );
  if (kinds.length === 0) return 0;
  const approved = await deps.db.query<{ id: string }>(
    `update public.actions set status = 'approved', approved_at = now()
      where task_id = $1 and status = 'proposed' and kind = any($2::text[]) returning id::text`,
    [taskId, kinds],
  );
  for (const row of approved.rows) await handleActionDecision(deps, row.id);
  return approved.rows.length;
}

/**
 * execute-action (SPEC 9, 11): dry-run logs the payload; otherwise calls the n8n webhook for the
 * kind with a signed body. Non-2xx or a timeout marks the action failed with the error body.
 */
export async function handleExecuteAction(deps: JobDeps, job: ActionJob): Promise<void> {
  const { db, log } = deps;
  const action = await loadAction(db, job.actionId);
  if (!action || action.status !== 'approved' || action.executed_at) return;
  const task = await loadTask(db, action.task_id);
  if (!task || task.status === 'cancelled') {
    await db.query(
      `update public.actions set status = 'rejected', error = 'Tugas dibatalkan' where id = $1`,
      [action.id],
    );
    return;
  }
  await transitionTask(db, task.id, ['awaiting_approval'], 'executing');

  const workflow = N8N_WORKFLOWS[action.kind];
  const envelope = {
    action_id: action.id,
    task_id: action.task_id,
    kind: action.kind,
    payload: action.payload,
    sent_at: new Date().toISOString(),
  };
  const dryRun = await isDryRun(deps, action.org_id);
  let status: 'executed' | 'failed';
  let response: unknown;
  let error: string | null = null;

  if (dryRun) {
    log.info(
      {
        actionId: action.id,
        kind: action.kind,
        workflow,
        payload: maskPii(JSON.stringify(action.payload)),
      },
      'dry-run: aksi tidak dikirim',
    );
    status = 'executed';
    response = { dry_run: true, workflow };
  } else {
    try {
      const result = await callN8n(deps.env, workflow, envelope);
      response = result.body;
      status = result.ok ? 'executed' : 'failed';
      if (!result.ok) error = `n8n membalas HTTP ${result.status}`;
    } catch (err) {
      status = 'failed';
      error =
        err instanceof N8nConfigError
          ? err.message
          : err instanceof Error && err.name === 'TimeoutError'
            ? 'n8n tidak membalas dalam 30 detik'
            : `Gagal menghubungi n8n: ${err instanceof Error ? err.message : String(err)}`;
      response = { error };
    }
    log.info(
      { actionId: action.id, kind: action.kind, workflow, status },
      'aksi dieksekusi via n8n',
    );
  }

  await db.query(
    `update public.actions set status = $2::action_status,
       executed_at = case when $2::text = 'executed' then now() else null end,
       response = $3::jsonb, error = $4 where id = $1`,
    [action.id, status, JSON.stringify(response ?? null), error],
  );
  await logEvent(db, {
    orgId: action.org_id,
    taskId: action.task_id,
    agentId: action.agent_id,
    type: status === 'executed' ? 'executed' : 'failed',
    payload: {
      action_id: action.id,
      kind: action.kind,
      dry_run: dryRun,
      ...(error ? { error } : {}),
    },
  });
  await resolveTaskActions(deps, action.task_id);
}
