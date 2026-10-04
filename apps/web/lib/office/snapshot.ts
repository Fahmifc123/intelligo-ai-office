import { agentsConfig } from '@intelligo/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import {
  ActionRow,
  AGENT_SUMMARY_COLUMNS,
  AgentStateRow,
  AgentSummary,
  LlmUsageRow,
  MAX_EVENTS,
  ReviewRow,
  SettingsRow,
  TaskEventRow,
  TaskRow,
  type OfficeSnapshot,
} from './types';

const parseList = <T>(schema: z.ZodType<T>, rows: unknown): T[] => {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
};

const byKey = <T>(rows: readonly T[], key: (row: T) => string): Record<string, T> =>
  Object.fromEntries(rows.map((row) => [key(row), row]));

/** Start of today in WIB (Asia/Jakarta, UTC+7) as an ISO string. */
export function startOfTodayWib(now = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 3600_000);
  wib.setUTCHours(0, 0, 0, 0);
  return new Date(wib.getTime() - 7 * 3600_000).toISOString();
}

/**
 * Loads everything the office screen shows. Works with the RLS-scoped client on the server
 * (first paint) and in the browser (refresh after a realtime reconnect).
 */
export async function loadOfficeSnapshot(supabase: SupabaseClient): Promise<OfficeSnapshot> {
  const today = startOfTodayWib();
  const recent = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const [agents, states, settings, tasks, events, actions, reviews, usage] = await Promise.all([
    supabase.from('agents').select(AGENT_SUMMARY_COLUMNS).order('id'),
    supabase.from('agent_states').select('*'),
    supabase.from('settings').select('*').maybeSingle(),
    supabase
      .from('tasks')
      .select('*')
      .or(`created_at.gte.${recent},status.not.in.(done,failed,cancelled)`)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('task_events').select('*').order('id', { ascending: false }).limit(MAX_EVENTS),
    supabase.from('actions').select('*').order('created_at', { ascending: false }).limit(100),
    supabase
      .from('reviews')
      .select('*')
      .gte('created_at', recent)
      .order('created_at', { ascending: true })
      .limit(300),
    supabase.from('llm_usage').select('*').gte('created_at', today).limit(5000),
  ]);

  const reviewRows = parseList(ReviewRow, reviews.data);
  const order = new Map(agentsConfig.map((agent, index) => [agent.id, index]));
  return {
    // Same order as agents.config.ts (manager first), unknown agents last.
    agents: parseList(AgentSummary, agents.data).sort(
      (a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) || a.name.localeCompare(b.name),
    ),
    states: byKey(parseList(AgentStateRow, states.data), (s) => s.agent_id),
    settings: settings.data ? (SettingsRow.safeParse(settings.data).data ?? null) : null,
    tasks: byKey(parseList(TaskRow, tasks.data), (t) => t.id),
    events: parseList(TaskEventRow, events.data),
    actions: byKey(parseList(ActionRow, actions.data), (a) => a.id),
    // Latest review per task (rows are ordered oldest first).
    reviews: byKey(reviewRows, (r) => r.task_id),
    usageToday: parseList(LlmUsageRow, usage.data),
  };
}
