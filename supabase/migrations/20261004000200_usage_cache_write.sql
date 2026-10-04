-- Cache writes are billed separately (1.25x input); keep them visible in usage reports.
alter table public.llm_usage
  add column cache_write_tokens int not null default 0 check (cache_write_tokens >= 0);

create index llm_usage_agent_month_idx on public.llm_usage (agent_id, created_at desc);
