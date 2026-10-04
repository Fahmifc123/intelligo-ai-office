-- Intelligo AI Office: initial schema (SPEC section 7).
-- Every table carries org_id and created_at. RLS is enabled everywhere; signed-in users
-- may read rows of their own org (org_id from the JWT app_metadata). Writes go through
-- the worker / Next.js server using the service role, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.agent_activity as enum (
  'working', 'idle', 'break', 'meeting', 'walking_to_review', 'reviewing', 'offline'
);

create type public.task_status as enum (
  'queued', 'routing', 'in_progress', 'awaiting_review', 'needs_revision',
  'awaiting_approval', 'executing', 'done', 'failed', 'cancelled'
);

create type public.action_status as enum ('proposed', 'approved', 'rejected', 'executed', 'failed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Org of the current request, taken from the JWT app_metadata (set server-side only).
create function public.current_org_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.agents (
  id text primary key,                                 -- 'cs', 'writer', 'manager', ...
  org_id uuid not null,
  name text not null,                                  -- 'Sinta'
  role text not null,                                  -- 'CS Chat 24 Jam'
  focus text not null,
  system_prompt text not null,
  model text not null,                                 -- seeded from MODEL_WORK, overridable
  tools text[] not null default '{}',
  desk_id text not null,                               -- config/office.layout.json desk id
  appearance jsonb not null,                           -- {shirt, hair, skin}
  idle_lines text[] not null default '{}',
  is_manager boolean not null default false,
  enabled boolean not null default true,
  monthly_token_budget int check (monthly_token_budget is null or monthly_token_budget >= 0),
  created_at timestamptz not null default now(),
  constraint agents_desk_unique unique (org_id, desk_id)
);

create table public.agent_states (
  agent_id text primary key references public.agents (id) on delete cascade,
  org_id uuid not null,
  activity public.agent_activity not null default 'idle',
  status_text text not null default '',
  current_task_id uuid,
  target_spot text,                                    -- 'desk' | 'pantry' | 'meeting' | 'lounge' | 'desk:<agent_id>'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  title text not null check (length(title) > 0),
  instructions text,
  requested_by uuid not null,                          -- auth.users.id
  assignee_id text references public.agents (id),
  assign_mode text not null check (assign_mode in ('auto', 'manual')),
  parent_task_id uuid references public.tasks (id),
  status public.task_status not null default 'queued',
  priority smallint not null default 2 check (priority between 1 and 3),
  result_text text,
  result_json jsonb,
  revision_count int not null default 0 check (revision_count >= 0),
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint tasks_manual_has_assignee check (assign_mode = 'auto' or assignee_id is not null)
);

alter table public.agent_states
  add constraint agent_states_current_task_fk
  foreign key (current_task_id) references public.tasks (id) on delete set null;

create table public.task_events (
  id bigserial primary key,
  org_id uuid not null,
  task_id uuid references public.tasks (id) on delete cascade,
  agent_id text references public.agents (id),
  type text not null check (
    type in ('routed', 'started', 'tool_call', 'tool_result', 'draft', 'review',
             'approval', 'executed', 'failed', 'note')
  ),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  task_id uuid not null references public.tasks (id) on delete cascade,
  reviewer_id text not null references public.agents (id),
  verdict text not null check (verdict in ('approved', 'revise')),
  notes text not null,
  scores jsonb,                                        -- {accuracy, tone, completeness} 1-5
  created_at timestamptz not null default now()
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  task_id uuid not null references public.tasks (id) on delete cascade,
  agent_id text not null references public.agents (id),
  kind text not null check (
    kind in ('send_whatsapp', 'send_whatsapp_bulk', 'send_email', 'create_invoice', 'schedule_post')
  ),
  payload jsonb not null,
  status public.action_status not null default 'proposed',
  approved_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  response jsonb,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id bigserial primary key,
  org_id uuid not null,
  agent_id text not null references public.agents (id),
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table public.llm_usage (
  id bigserial primary key,
  org_id uuid not null,
  agent_id text references public.agents (id),
  task_id uuid references public.tasks (id) on delete set null,
  purpose text not null check (purpose in ('route', 'run', 'review', 'chat')),
  model text not null,
  input_tokens int not null check (input_tokens >= 0),
  output_tokens int not null check (output_tokens >= 0),
  cache_read_tokens int not null default 0 check (cache_read_tokens >= 0),
  cost_usd numeric(10, 6) not null check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create table public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  title text not null,
  content text not null,                               -- markdown
  tags text[] not null default '{}',                   -- 'harga', 'program', 'sop-cs'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Org-level settings (SPEC sections 10 and 12.7).
create table public.settings (
  org_id uuid primary key,
  auto_approve_kinds text[] not null default '{}',
  dry_run boolean not null default true,
  usd_to_idr numeric(12, 2) not null default 16000 check (usd_to_idr > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index agents_org_idx on public.agents (org_id);
create index agent_states_org_idx on public.agent_states (org_id);
create index tasks_org_status_idx on public.tasks (org_id, status);
create index tasks_assignee_status_idx on public.tasks (assignee_id, status);
create index tasks_parent_idx on public.tasks (parent_task_id) where parent_task_id is not null;
create index tasks_org_created_idx on public.tasks (org_id, created_at desc);
create index task_events_task_idx on public.task_events (task_id, created_at);
create index task_events_org_created_idx on public.task_events (org_id, created_at desc);
create index reviews_task_idx on public.reviews (task_id);
create index actions_org_status_idx on public.actions (org_id, status);
create index actions_task_idx on public.actions (task_id);
create index chat_messages_thread_idx on public.chat_messages (agent_id, user_id, created_at);
create index llm_usage_org_created_idx on public.llm_usage (org_id, created_at);
create index llm_usage_agent_created_idx on public.llm_usage (agent_id, created_at);
create index llm_usage_task_idx on public.llm_usage (task_id) where task_id is not null;
create index knowledge_docs_org_idx on public.knowledge_docs (org_id);
create index knowledge_docs_tags_idx on public.knowledge_docs using gin (tags);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger agent_states_set_updated_at
  before update on public.agent_states
  for each row execute function public.set_updated_at();

create trigger knowledge_docs_set_updated_at
  before update on public.knowledge_docs
  for each row execute function public.set_updated_at();

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.agents enable row level security;
alter table public.agent_states enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.reviews enable row level security;
alter table public.actions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.llm_usage enable row level security;
alter table public.knowledge_docs enable row level security;
alter table public.settings enable row level security;

create policy agents_select_own_org on public.agents
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy agent_states_select_own_org on public.agent_states
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy tasks_select_own_org on public.tasks
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy task_events_select_own_org on public.task_events
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy reviews_select_own_org on public.reviews
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy actions_select_own_org on public.actions
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy chat_messages_select_own on public.chat_messages
  for select to authenticated
  using (org_id = (select public.current_org_id()) and user_id = (select auth.uid()));
create policy llm_usage_select_own_org on public.llm_usage
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy knowledge_docs_select_own_org on public.knowledge_docs
  for select to authenticated using (org_id = (select public.current_org_id()));
create policy settings_select_own_org on public.settings
  for select to authenticated using (org_id = (select public.current_org_id()));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.agent_states, public.tasks, public.task_events, public.actions;
