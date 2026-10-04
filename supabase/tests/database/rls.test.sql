-- Run with `pnpm db:test` (supabase test db). Verifies schema, seed, and RLS.
begin;
select plan(32);

-- Tables from SPEC section 7 (+ settings)
select has_table('public', t, 'table ' || t || ' exists')
from unnest(array[
  'agents', 'agent_states', 'tasks', 'task_events', 'reviews', 'actions',
  'chat_messages', 'llm_usage', 'knowledge_docs', 'settings', 'org_members'
]) as t;

-- RLS enabled on every public table
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS is enabled on every public table'
);

-- Seed
select is((select count(*)::int from public.agents), 12, 'seed has 12 agents');
select is((select count(*)::int from public.agent_states), 12, 'seed has 12 agent states');
select is(
  (select count(*)::int from public.agents where is_manager),
  1,
  'exactly one manager'
);
select is(
  (select count(*)::int from public.settings),
  1,
  'seed has one settings row'
);

-- Realtime publication
select is(
  (select array_agg(tablename::text order by tablename) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['actions', 'agent_states', 'llm_usage', 'reviews', 'settings', 'task_events', 'tasks'],
  'realtime publishes the tables the UI subscribes to'
);

-- Member claims: a new auth user on the allowlist gets org_id and role in app_metadata
insert into auth.users (id, email, raw_app_meta_data)
values ('dddddddd-0000-4000-8000-000000000001', 'Staff@Intelligo.test', '{"provider":"email"}');
select is(
  (select raw_app_meta_data ->> 'org_id' from auth.users where id = 'dddddddd-0000-4000-8000-000000000001'),
  '00000000-0000-0000-0000-000000000001',
  'allowlisted user gets org_id claim'
);
select is(
  (select user_id::text from public.org_members where email = 'staff@intelligo.test'),
  'dddddddd-0000-4000-8000-000000000001',
  'member row is linked to the auth user'
);
update public.org_members set role = 'viewer' where email = 'staff@intelligo.test';
select is(
  (select raw_app_meta_data ->> 'role' from auth.users where id = 'dddddddd-0000-4000-8000-000000000001'),
  'viewer',
  'role change refreshes the claim'
);

-- Fixture rows for RLS checks (as postgres, bypassing RLS)
insert into public.tasks (id, org_id, title, requested_by, assign_mode, assignee_id)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Tugas org sendiri', 'bbbbbbbb-0000-4000-8000-000000000001', 'manual', 'writer'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000009',
   'Tugas org lain', 'bbbbbbbb-0000-4000-8000-000000000002', 'auto', null);

-- anon sees nothing
set local role anon;
select is((select count(*)::int from public.agents), 0, 'anon cannot read agents');
select is((select count(*)::int from public.tasks), 0, 'anon cannot read tasks');
reset role;

-- authenticated user of the seeded org
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"org_id":"00000000-0000-0000-0000-000000000001"}}';
select is((select count(*)::int from public.agents), 12, 'member reads own org agents');
select is((select count(*)::int from public.agent_states), 12, 'member reads own org agent states');
select is((select count(*)::int from public.tasks), 1, 'member only reads own org tasks');
select lives_ok(
  $$update public.agent_states set activity = 'break' where agent_id = 'cs'$$,
  'member update runs without error'
);
reset role;
select is(
  (select activity::text from public.agent_states where agent_id = 'cs'),
  'working',
  'member update is blocked by RLS (no rows changed)'
);

-- authenticated user of another org
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"org_id":"cccccccc-0000-4000-8000-000000000009"}}';
select is((select count(*)::int from public.agents), 0, 'other org cannot read agents');
reset role;

-- cost views keep the RLS of llm_usage (security_invoker)
insert into public.llm_usage (org_id, agent_id, task_id, purpose, model, input_tokens, output_tokens, cost_usd)
values
  ('00000000-0000-0000-0000-000000000001', 'writer', 'aaaaaaaa-0000-4000-8000-000000000001',
   'run', 'test-model', 1000, 100, 0.5),
  ('cccccccc-0000-4000-8000-000000000009', null, null, 'chat', 'test-model', 9000, 900, 7);
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"org_id":"00000000-0000-0000-0000-000000000001"}}';
select is((select sum(cost_usd)::numeric from public.usage_by_day), 0.5::numeric, 'usage_by_day only sums own org');
select is(
  (select input_tokens::int from public.usage_by_agent_month where agent_id = 'writer'),
  1000,
  'usage_by_agent_month counts own org tokens'
);
select is((select count(*)::int from public.usage_by_task), 1, 'usage_by_task only lists own org tasks');
reset role;
set local role anon;
select throws_ok(
  'select count(*) from public.usage_by_day',
  '42501',
  null,
  'anon cannot read cost views'
);
reset role;

select * from finish();
rollback;
