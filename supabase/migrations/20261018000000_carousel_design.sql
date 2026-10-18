-- Fase 9: Instagram carousel design (designer agent). Generated slides are stored in Supabase
-- Storage (bucket `posters`) and reviewed by a human through a `design_review` action.

alter table public.actions drop constraint actions_kind_check;
alter table public.actions add constraint actions_kind_check check (
  kind in ('send_whatsapp', 'send_whatsapp_bulk', 'send_email', 'create_invoice', 'schedule_post', 'design_review')
);

alter table public.llm_usage drop constraint llm_usage_purpose_check;
alter table public.llm_usage add constraint llm_usage_purpose_check check (
  purpose in ('route', 'run', 'review', 'chat', 'image')
);

-- Visual style for generated posters; empty means the built-in default guide.
alter table public.settings add column brand_guide text not null default '';

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  task_id uuid not null references public.tasks (id) on delete cascade,
  agent_id text references public.agents (id),
  -- task.revision_count when generated: the review looks at the latest version only.
  version int not null default 0 check (version >= 0),
  position int not null check (position between 1 and 10),
  headline text not null,
  body text not null default '',
  prompt text not null,
  storage_path text not null,
  url text not null,
  content_type text not null,
  created_at timestamptz not null default now()
);

create index media_assets_task_idx on public.media_assets (task_id, version, position);

alter table public.media_assets enable row level security;
create policy media_assets_select_own_org on public.media_assets
  for select to authenticated using (org_id = (select public.current_org_id()));
grant select on public.media_assets to authenticated;
grant all on public.media_assets to service_role;

-- Public bucket: the images are marketing material meant to be published.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, allowed_mime_types)
    values ('posters', 'posters', true, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end
$$;
