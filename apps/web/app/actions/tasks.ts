'use server';

import { deriveTitle, TASKS_PER_HOUR_LIMIT } from '@intelligo/shared';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { runAction, UserError, type ActionResult } from './result';

const CreateTaskInput = z.object({
  text: z
    .string()
    .trim()
    .min(3, 'Tulis tugas minimal 3 karakter.')
    .max(4000, 'Tugas maksimal 4000 karakter.'),
  assignee: z.string().min(1),
  priority: z.coerce.number().int().min(1).max(3),
});

/** Composer: inserts a task; the worker picks it up via NOTIFY (route-task or run-task). */
export async function createTask(
  input: z.input<typeof CreateTaskInput>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const viewer = await authorize(['owner', 'staff']);
    const parsed = CreateTaskInput.safeParse(input);
    if (!parsed.success)
      throw new UserError(parsed.error.issues[0]?.message ?? 'Input tidak valid.');
    const { text, assignee, priority } = parsed.data;
    const admin = getAdminSupabase();

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('requested_by', viewer.userId)
      .is('parent_task_id', null)
      .gte('created_at', since);
    if ((count ?? 0) >= TASKS_PER_HOUR_LIMIT) {
      throw new UserError(`Batas ${TASKS_PER_HOUR_LIMIT} tugas per jam tercapai. Coba lagi nanti.`);
    }

    const manual = assignee !== 'auto';
    if (manual) {
      const { data: agent } = await admin
        .from('agents')
        .select('id, enabled, name')
        .eq('id', assignee)
        .eq('org_id', viewer.orgId)
        .maybeSingle();
      if (!agent) throw new UserError('Agen tujuan tidak ditemukan.');
      if (!agent.enabled) throw new UserError(`${String(agent.name)} sedang nonaktif.`);
    }

    const { data, error } = await admin
      .from('tasks')
      .insert({
        org_id: viewer.orgId,
        title: deriveTitle(text),
        instructions: text,
        requested_by: viewer.userId,
        assignee_id: manual ? assignee : null,
        assign_mode: manual ? 'manual' : 'auto',
        priority,
      })
      .select('id')
      .single();
    if (error || !data) throw new UserError('Gagal menyimpan tugas.');
    return { id: String(data.id) };
  });
}

const ACTIVE = [
  'queued',
  'routing',
  'in_progress',
  'awaiting_review',
  'needs_revision',
  'awaiting_approval',
];

/** Cancels a task that has not finished; pending actions are rejected so nothing is sent. */
export async function cancelTask(taskId: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner', 'staff']);
    const id = z.guid().parse(taskId);
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('tasks')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', viewer.orgId)
      .in('status', ACTIVE)
      .select('id');
    if (error) throw new UserError('Gagal membatalkan tugas.');
    if (!data || data.length === 0)
      throw new UserError('Tugas sudah selesai atau sedang dieksekusi.');
    await admin
      .from('actions')
      .update({ status: 'rejected' })
      .eq('task_id', id)
      .eq('status', 'proposed');
    return undefined;
  });
}
