-- Maintenance reminders (Phase 3 M4, slice 3): a short email each morning to the people who book vehicles in, when
-- something is overdue or due soon. Each person chooses how they are told; the portal always shows what is due.
--
-- `reminder_preferences`: a person's choice, 'email' or 'none' (portal only). No row means the default, email, for anyone
-- who holds manage_maintenance. (Text messages are not offered yet: they need a mobile number and cost per message.)
-- `reminder_log`: the day a person was last sent a reminder, one row per person per day. The row is claimed before the
-- email is sent and released if sending fails, so nobody gets two on one day and a failure is tried again.
create table maintenance.reminder_preferences (
  staff_id uuid primary key,
  company_id uuid not null,
  channel text not null check (channel in ('email', 'none')),
  updated_at timestamptz not null
);
create index reminder_preferences_company_idx on maintenance.reminder_preferences (company_id);

create table maintenance.reminder_log (
  staff_id uuid not null,
  day date not null,
  company_id uuid not null,
  sent_at timestamptz not null,
  primary key (staff_id, day)
);

grant select, insert, update, delete on all tables in schema maintenance to wagonwise_app;

alter table maintenance.reminder_preferences enable row level security;
create policy company_rows on maintenance.reminder_preferences
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
alter table maintenance.reminder_log enable row level security;
create policy company_rows on maintenance.reminder_log
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
