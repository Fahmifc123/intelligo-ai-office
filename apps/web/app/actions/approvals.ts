'use server';

import { ActionKind, parseActionPayload } from '@intelligo/shared';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { runAction, UserError, type ActionResult } from './result';

const Pending = z.object({ id: z.string(), kind: ActionKind, status: z.string() });

async function loadPending(orgId: string, actionId: string): Promise<z.infer<typeof Pending>> {
  const { data } = await getAdminSupabase()
    .from('actions')
    .select('id, kind, status')
    .eq('id', z.guid().parse(actionId))
    .eq('org_id', orgId)
    .maybeSingle();
  const action = Pending.safeParse(data);
  if (!action.success) throw new UserError('Aksi tidak ditemukan.');
  if (action.data.status !== 'proposed') throw new UserError('Aksi ini sudah diputuskan.');
  return action.data;
}

/**
 * Owner approves an action, optionally with an edited payload (validated with the same schema
 * as the agent's proposal). The worker logs the approval with a diff and executes it.
 */
export async function approveAction(
  actionId: string,
  editedPayload?: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner']);
    const action = await loadPending(viewer.orgId, actionId);
    const patch: Record<string, unknown> = {
      status: 'approved',
      approved_by: viewer.userId,
      approved_at: new Date().toISOString(),
    };
    if (editedPayload !== undefined) {
      const parsed = parseActionPayload(action.kind, editedPayload);
      if (!parsed.ok) throw new UserError(`Payload tidak valid: ${parsed.error}`);
      patch.payload = parsed.value;
    }
    const { data, error } = await getAdminSupabase()
      .from('actions')
      .update(patch)
      .eq('id', action.id)
      .eq('status', 'proposed')
      .select('id');
    if (error || !data?.length) throw new UserError('Gagal menyetujui aksi.');
    return undefined;
  });
}

export async function rejectAction(actionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner']);
    const action = await loadPending(viewer.orgId, actionId);
    const { data, error } = await getAdminSupabase()
      .from('actions')
      .update({
        status: 'rejected',
        rejected_by: viewer.userId,
        rejected_at: new Date().toISOString(),
      })
      .eq('id', action.id)
      .eq('status', 'proposed')
      .select('id');
    if (error || !data?.length) throw new UserError('Gagal menolak aksi.');
    return undefined;
  });
}
