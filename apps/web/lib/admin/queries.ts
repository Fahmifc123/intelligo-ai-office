import 'server-only';
import { AgentRow, KnowledgeDocRow, MemberRole } from '@intelligo/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const list = <T>(schema: z.ZodType<T>, rows: unknown): T[] =>
  (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });

const Num = z.union([z.number(), z.string()]).pipe(z.coerce.number());

export const AgentMonthUsage = z.object({
  agent_id: z.string().nullable(),
  input_tokens: Num,
  output_tokens: Num,
  cost_usd: Num,
  calls: Num,
});
export type AgentMonthUsage = z.infer<typeof AgentMonthUsage>;

export const DayUsage = z.object({
  day: z.string(),
  cost_usd: Num,
  input_tokens: Num,
  output_tokens: Num,
  calls: Num,
});
export type DayUsage = z.infer<typeof DayUsage>;

export const Member = z.object({
  id: z.string(),
  email: z.string(),
  role: MemberRole,
  user_id: z.string().nullable(),
  created_at: z.string(),
});
export type Member = z.infer<typeof Member>;

/** First day of the current month in WIB, as YYYY-MM-DD (matches usage_by_agent_month.month). */
export function currentMonthWib(now = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 3600_000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export async function loadAgentsAdmin(supabase: SupabaseClient) {
  const since = new Date(Date.now() - 13 * 24 * 3600_000).toISOString().slice(0, 10);
  const [agents, usage, days] = await Promise.all([
    supabase.from('agents').select('*').order('id'),
    supabase
      .from('usage_by_agent_month')
      .select('agent_id, input_tokens, output_tokens, cost_usd, calls')
      .eq('month', currentMonthWib()),
    supabase
      .from('usage_by_day')
      .select('day, cost_usd, input_tokens, output_tokens, calls')
      .gte('day', since)
      .order('day', { ascending: false }),
  ]);
  return {
    agents: list(AgentRow, agents.data),
    usage: list(AgentMonthUsage, usage.data),
    days: list(DayUsage, days.data),
  };
}

export async function loadSettingsAdmin(supabase: SupabaseClient) {
  const [docs, members] = await Promise.all([
    supabase.from('knowledge_docs').select('*').order('title'),
    supabase.from('org_members').select('id, email, role, user_id, created_at').order('email'),
  ]);
  return { docs: list(KnowledgeDocRow, docs.data), members: list(Member, members.data) };
}
