-- Approval bookkeeping: what the agent proposed (for the edit diff), who rejected, and errors.
alter table public.actions
  add column original_payload jsonb,
  add column rejected_by uuid,
  add column rejected_at timestamptz,
  add column error text;

-- Broadcasts always need a manual Owner approval (SPEC 10, 14).
alter table public.settings
  add constraint settings_no_auto_broadcast check (not ('send_whatsapp_bulk' = any(auto_approve_kinds)));
