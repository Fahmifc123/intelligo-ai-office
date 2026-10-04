-- Members & roles, office modes, dispatch bookkeeping, and worker notifications.

-- ---------------------------------------------------------------------------
-- Members (allowlist by email + role). user_id is linked when the person signs in.
-- ---------------------------------------------------------------------------

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('owner', 'staff', 'viewer')),
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint org_members_email_unique unique (email)
);

create index org_members_org_idx on public.org_members (org_id);

alter table public.org_members enable row level security;

create policy org_members_select_own_org on public.org_members
  for select to authenticated using (org_id = (select public.current_org_id()));

-- Writes org_id and role into the user's app_metadata so RLS can read them from the JWT.
create function public.apply_member_claims(target_user uuid, member_org uuid, member_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('org_id', member_org, 'role', member_role)
  where id = target_user;
end;
$$;

create function public.clear_member_claims(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'org_id' - 'role'
  where id = target_user;
end;
$$;

-- New auth user: copy claims from the allowlist before the row is written.
create function public.on_auth_user_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.org_members%rowtype;
begin
  select * into member from public.org_members where email = lower(new.email);
  if found then
    new.raw_app_meta_data = coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('org_id', member.org_id, 'role', member.role);
  end if;
  return new;
end;
$$;

create function public.on_auth_user_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.org_members set user_id = new.id
  where email = lower(new.email) and user_id is null;
  return new;
end;
$$;

create trigger intelligo_auth_user_before_insert
  before insert on auth.users
  for each row execute function public.on_auth_user_before_insert();

create trigger intelligo_auth_user_after_insert
  after insert on auth.users
  for each row execute function public.on_auth_user_after_insert();

-- Member added or changed after the user already exists: link and refresh claims.
create function public.on_member_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email = lower(new.email);
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = new.email;
  end if;
  return new;
end;
$$;

create function public.on_member_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.user_id is not null then
      perform public.clear_member_claims(old.user_id);
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.user_id is not null and old.user_id is distinct from new.user_id then
    perform public.clear_member_claims(old.user_id);
  end if;
  if new.user_id is not null then
    perform public.apply_member_claims(new.user_id, new.org_id, new.role);
  end if;
  return new;
end;
$$;

create trigger org_members_before_write
  before insert or update on public.org_members
  for each row execute function public.on_member_before_write();

create trigger org_members_after_write
  after insert or update or delete on public.org_members
  for each row execute function public.on_member_after_write();

revoke execute on function public.apply_member_claims(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.clear_member_claims(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Office modes (Rapat tim / Jam istirahat), shared by all viewers.
-- ---------------------------------------------------------------------------

alter table public.settings
  add column meeting_until timestamptz,
  add column break_mode boolean not null default false;

-- ---------------------------------------------------------------------------
-- Dispatch bookkeeping: the worker claims a row before enqueueing its job.
-- ---------------------------------------------------------------------------

alter table public.tasks add column dispatched_at timestamptz;
alter table public.actions add column dispatched_at timestamptz;

create index tasks_undispatched_idx on public.tasks (created_at)
  where status = 'queued' and dispatched_at is null;
create index actions_undispatched_idx on public.actions (created_at)
  where status = 'approved' and dispatched_at is null;

-- ---------------------------------------------------------------------------
-- Worker notifications (LISTEN intelligo_dispatch). The worker also sweeps
-- periodically, so a missed notification only delays work.
-- ---------------------------------------------------------------------------

create function public.notify_dispatch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'tasks' then
    if tg_op = 'INSERT' then
      perform pg_notify('intelligo_dispatch', json_build_object('kind', 'task', 'id', new.id)::text);
    elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      perform pg_notify('intelligo_dispatch', json_build_object('kind', 'task_cancelled', 'id', new.id)::text);
    end if;
  elsif tg_table_name = 'actions' then
    if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
      perform pg_notify('intelligo_dispatch', json_build_object('kind', 'action', 'id', new.id)::text);
    end if;
  elsif tg_table_name = 'settings' then
    if new.meeting_until is distinct from old.meeting_until or new.break_mode is distinct from old.break_mode then
      perform pg_notify('intelligo_dispatch', json_build_object('kind', 'office', 'id', new.org_id)::text);
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_notify_dispatch
  after insert or update of status on public.tasks
  for each row execute function public.notify_dispatch();

create trigger actions_notify_dispatch
  after update of status on public.actions
  for each row execute function public.notify_dispatch();

create trigger settings_notify_dispatch
  after update on public.settings
  for each row execute function public.notify_dispatch();

-- ---------------------------------------------------------------------------
-- Realtime: header (mode buttons, cost) and board (review notes) also listen.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.settings, public.llm_usage, public.reviews;
