'use server';

import { MEETING_DURATION_MS } from '@intelligo/shared';
import { authorize } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { runAction, UserError, type ActionResult } from './result';

/**
 * Rapat tim: free agents go to the meeting room for 25 seconds. The worker applies it to
 * agent_states (the web app never writes agent_states itself).
 */
export async function startMeeting(): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner', 'staff']);
    const meetingUntil = new Date(Date.now() + MEETING_DURATION_MS).toISOString();
    const { error } = await getAdminSupabase()
      .from('settings')
      .update({ meeting_until: meetingUntil, break_mode: false })
      .eq('org_id', viewer.orgId);
    if (error) throw new UserError('Gagal memulai rapat.');
    return undefined;
  });
}

/** Jam istirahat on/off. The task queue keeps running during the break. */
export async function setBreakMode(on: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner', 'staff']);
    const patch = on ? { break_mode: true, meeting_until: null } : { break_mode: false };
    const { error } = await getAdminSupabase()
      .from('settings')
      .update(patch)
      .eq('org_id', viewer.orgId);
    if (error) throw new UserError('Gagal mengubah jam istirahat.');
    return undefined;
  });
}
