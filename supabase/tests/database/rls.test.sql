-- Run with `pnpm db:test` (supabase test db). Verifies schema, seed, and RLS.
begin;
select plan(24);

-- Tables from SPEC section 7 (+ settings)
select has_table('public', t, 'table ' || t || ' exists')
from unnest(array[
  'agents', 'agent_states', 'tasks', 'task_events', 'reviews', 'actions',
  'chat_messages', 'llm_usage', 'knowledge_docs', 'settings'
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
  array['actions', 'agent_states', 'task_events', 'tasks'],
  'realtime publishes agent_states, tasks, task_events, actions'
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

select * from finish();
rollback;
