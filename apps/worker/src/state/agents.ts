import { AgentRow } from '@intelligo/shared';
import type { Queryable } from '../lib/db';

export async function loadAgent(q: Queryable, agentId: string): Promise<AgentRow | undefined> {
  const result = await q.query(
    `select id, org_id, name, role, focus, system_prompt, model, tools, desk_id, appearance, idle_lines,
            is_manager, enabled, monthly_token_budget, created_at
       from public.agents where id = $1`,
    [agentId],
  );
  return result.rows[0] ? AgentRow.parse(result.rows[0]) : undefined;
}

export async function loadAgents(q: Queryable, orgId: string): Promise<AgentRow[]> {
  const result = await q.query(
    `select id, org_id, name, role, focus, system_prompt, model, tools, desk_id, appearance, idle_lines,
            is_manager, enabled, monthly_token_budget, created_at
       from public.agents where org_id = $1 order by id`,
    [orgId],
  );
  return result.rows.map((row) => AgentRow.parse(row));
}

export async function loadManager(q: Queryable, orgId: string): Promise<AgentRow | undefined> {
  return (await loadAgents(q, orgId)).find((agent) => agent.is_manager);
}

/** Start of the current month in WIB (UTC+7). */
export function startOfMonthWib(now = new Date()): Date {
  const wib = new Date(now.getTime() + 7 * 3600_000);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - 7 * 3600_000);
}

/** Input-side tokens used this month (SPEC 14: the budget counts input tokens). */
export async function monthlyInputTokens(
  q: Queryable,
  agentId: string,
  now = new Date(),
): Promise<number> {
  const result = await q.query<{ total: string | null }>(
    `select sum(input_tokens + cache_read_tokens + cache_write_tokens)::text as total
       from public.llm_usage where agent_id = $1 and created_at >= $2`,
    [agentId, startOfMonthWib(now)],
  );
  return Number(result.rows[0]?.total ?? 0);
}
