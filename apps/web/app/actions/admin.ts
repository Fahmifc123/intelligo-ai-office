'use server';

import { AUTO_APPROVABLE_KINDS, MemberRole, ToolName } from '@intelligo/shared';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { runAction, UserError, type ActionResult } from './result';

/* ---------- Agents (/agents) ---------- */

const AgentUpdate = z.object({
  enabled: z.boolean(),
  system_prompt: z.string().trim().min(50, 'System prompt terlalu pendek.').max(20_000),
  tools: z.array(ToolName),
  monthly_token_budget: z.number().int().min(0).max(1_000_000_000).nullable(),
});

export async function updateAgent(
  agentId: string,
  input: z.input<typeof AgentUpdate>,
): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner']);
    const parsed = AgentUpdate.safeParse(input);
    if (!parsed.success)
      throw new UserError(parsed.error.issues[0]?.message ?? 'Input tidak valid.');
    const admin = getAdminSupabase();
    const { data: agent } = await admin
      .from('agents')
      .select('id, is_manager')
      .eq('id', agentId)
      .eq('org_id', viewer.orgId)
      .maybeSingle();
    if (!agent) throw new UserError('Agen tidak ditemukan.');
    const tools = new Set(parsed.data.tools);
    tools.add('submit_result');
    if (!agent.is_manager && tools.has('delegate_task'))
      throw new UserError('delegate_task hanya untuk AI Manager.');
    if (agent.is_manager && !parsed.data.enabled)
      throw new UserError('AI Manager tidak bisa dinonaktifkan karena dibutuhkan untuk review.');
    const { error } = await admin
      .from('agents')
      .update({ ...parsed.data, tools: [...tools] })
      .eq('id', agentId)
      .eq('org_id', viewer.orgId);
    if (error) throw new UserError('Gagal menyimpan agen.');
    return undefined;
  });
}

/* ---------- Knowledge base (/settings) ---------- */

const KnowledgeDoc = z.object({
  id: z.guid().optional(),
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(10, 'Isi dokumen terlalu pendek.').max(50_000),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10),
});

export async function saveKnowledgeDoc(
  input: z.input<typeof KnowledgeDoc>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const viewer = await authorize(['owner']);
    const parsed = KnowledgeDoc.safeParse(input);
    if (!parsed.success)
      throw new UserError(parsed.error.issues[0]?.message ?? 'Input tidak valid.');
    const { id, ...fields } = parsed.data;
    const admin = getAdminSupabase();
    const query = id
      ? admin
          .from('knowledge_docs')
          .update(fields)
          .eq('id', id)
          .eq('org_id', viewer.orgId)
          .select('id')
          .single()
      : admin
          .from('knowledge_docs')
          .insert({ ...fields, org_id: viewer.orgId })
          .select('id')
          .single();
    const { data, error } = await query;
    if (error || !data) throw new UserError('Gagal menyimpan dokumen.');
    return { id: String(data.id) };
  });
}

export async function deleteKnowledgeDoc(docId: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner']);
    const { error } = await getAdminSupabase()
      .from('knowledge_docs')
      .delete()
      .eq('id', z.guid().parse(docId))
      .eq('org_id', viewer.orgId);
    if (error) throw new UserError('Gagal menghapus dokumen.');
    return undefined;
  });
}

/* ---------- Settings (/settings) ---------- */

const SettingsUpdate = z.object({
  auto_approve_kinds: z.array(z.enum(AUTO_APPROVABLE_KINDS as [string, ...string[]])),
  dry_run: z.boolean(),
  usd_to_idr: z.number().min(1000).max(100_000),
});

export async function updateSettings(input: z.input<typeof SettingsUpdate>): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner']);
    const parsed = SettingsUpdate.safeParse(input);
    if (!parsed.success)
      throw new UserError(parsed.error.issues[0]?.message ?? 'Pengaturan tidak valid.');
    const { error } = await getAdminSupabase()
      .from('settings')
      .update(parsed.data)
      .eq('org_id', viewer.orgId);
    if (error) throw new UserError('Gagal menyimpan pengaturan.');
    return undefined;
  });
}

/* ---------- Members (/settings) ---------- */

const MemberInput = z.object({
  email: z.email('Email tidak valid.').transform((v) => v.trim().toLowerCase()),
  role: MemberRole,
});

async function ownerCount(orgId: string): Promise<number> {
  const { count } = await getAdminSupabase()
    .from('org_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('role', 'owner');
  return count ?? 0;
}

export async function saveMember(input: z.input<typeof MemberInput>): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner']);
    const parsed = MemberInput.safeParse(input);
    if (!parsed.success)
      throw new UserError(parsed.error.issues[0]?.message ?? 'Input tidak valid.');
    const admin = getAdminSupabase();
    const { data: existing } = await admin
      .from('org_members')
      .select('id, org_id, role')
      .eq('email', parsed.data.email)
      .maybeSingle();
    if (existing && existing.org_id !== viewer.orgId)
      throw new UserError('Email ini terdaftar di organisasi lain.');
    if (
      existing?.role === 'owner' &&
      parsed.data.role !== 'owner' &&
      (await ownerCount(viewer.orgId)) <= 1
    ) {
      throw new UserError('Harus ada minimal satu Owner.');
    }
    const { error } = existing
      ? await admin.from('org_members').update({ role: parsed.data.role }).eq('id', existing.id)
      : await admin
          .from('org_members')
          .insert({ org_id: viewer.orgId, email: parsed.data.email, role: parsed.data.role });
    if (error) throw new UserError('Gagal menyimpan anggota.');
    return undefined;
  });
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await authorize(['owner']);
    const admin = getAdminSupabase();
    const { data: member } = await admin
      .from('org_members')
      .select('id, role, user_id')
      .eq('id', z.guid().parse(memberId))
      .eq('org_id', viewer.orgId)
      .maybeSingle();
    if (!member) throw new UserError('Anggota tidak ditemukan.');
    if (member.user_id === viewer.userId)
      throw new UserError('Anda tidak bisa menghapus akun sendiri.');
    if (member.role === 'owner' && (await ownerCount(viewer.orgId)) <= 1)
      throw new UserError('Harus ada minimal satu Owner.');
    const { error } = await admin.from('org_members').delete().eq('id', member.id);
    if (error) throw new UserError('Gagal menghapus anggota.');
    return undefined;
  });
}
