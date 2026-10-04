-- Cost views for the admin pages. security_invoker keeps RLS of llm_usage in force.

create view public.usage_by_agent_month with (security_invoker = true) as
select
  org_id,
  agent_id,
  date_trunc('month', created_at at time zone 'Asia/Jakarta')::date as month,
  sum(input_tokens + cache_read_tokens + cache_write_tokens)::bigint as input_tokens,
  sum(output_tokens)::bigint as output_tokens,
  sum(cost_usd)::numeric(12, 6) as cost_usd,
  count(*)::int as calls
from public.llm_usage
group by org_id, agent_id, date_trunc('month', created_at at time zone 'Asia/Jakarta');

create view public.usage_by_day with (security_invoker = true) as
select
  org_id,
  (created_at at time zone 'Asia/Jakarta')::date as day,
  sum(cost_usd)::numeric(12, 6) as cost_usd,
  sum(input_tokens + cache_read_tokens + cache_write_tokens)::bigint as input_tokens,
  sum(output_tokens)::bigint as output_tokens,
  count(*)::int as calls
from public.llm_usage
group by org_id, (created_at at time zone 'Asia/Jakarta')::date;

create view public.usage_by_task with (security_invoker = true) as
select
  org_id,
  task_id,
  sum(cost_usd)::numeric(12, 6) as cost_usd,
  sum(input_tokens + cache_read_tokens + cache_write_tokens)::bigint as input_tokens,
  sum(output_tokens)::bigint as output_tokens,
  count(*)::int as calls
from public.llm_usage
where task_id is not null
group by org_id, task_id;

revoke all on public.usage_by_agent_month, public.usage_by_day, public.usage_by_task from anon, public;
grant select on public.usage_by_agent_month, public.usage_by_day, public.usage_by_task to authenticated, service_role;
