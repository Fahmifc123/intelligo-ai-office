import { ACTION_KIND_LABELS, maskPii, type ActionKind } from '@intelligo/shared';
import type { ToolContext, ToolOutput } from './types';

/**
 * Records an external action as `proposed`. Nothing is sent: the Owner approves it on
 * /approvals (or it is auto-approved by settings), then execute-action calls n8n.
 */
export async function proposeAction(
  ctx: ToolContext,
  kind: ActionKind,
  payload: Record<string, unknown>,
): Promise<ToolOutput> {
  const result = await ctx.db.query<{ id: string }>(
    `insert into public.actions (org_id, task_id, agent_id, kind, payload, original_payload, status)
     values ($1, $2, $3, $4, $5::jsonb, $5::jsonb, 'proposed') returning id::text`,
    [ctx.orgId, ctx.task.id, ctx.agent.id, kind, JSON.stringify(payload)],
  );
  const id = result.rows[0]?.id ?? '';
  ctx.log.info(
    { taskId: ctx.task.id, kind, payload: maskPii(JSON.stringify(payload)) },
    'aksi diusulkan',
  );
  return {
    content: {
      action_id: id,
      status: 'menunggu approval',
      note: `${ACTION_KIND_LABELS[kind]} belum terkirim. Owner akan meninjau dan menyetujui sebelum dikirim.`,
    },
    summary: `${ACTION_KIND_LABELS[kind]} diusulkan, menunggu approval`,
  };
}
