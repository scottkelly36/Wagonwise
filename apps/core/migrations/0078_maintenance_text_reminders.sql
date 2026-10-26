-- Maintenance reminders by text message (Phase 3 M4 follow-up). A company chooses how its reminders go: email (as before), text or
-- both. A text goes to a mobile number the person has added themselves; someone with no number, or a company past its monthly
-- limit, gets the email instead, so nobody is missed.
--
-- `reminder_settings`: the company's choice. No row means email.
-- `reminder_preferences.mobile`: the person's own UK mobile, in the form +447700900123. Kept only as long as they keep it.
-- `reminder_text_counts`: texts sent for a company in a UK calendar month, to stop one company's reminders costing without limit.
create table maintenance.reminder_settings (
  company_id uuid primary key,
  channel text not null check (channel in ('email', 'text', 'both')),
  updated_at timestamptz not null,
  updated_by uuid
);

alter table maintenance.reminder_preferences
  add column mobile text check (mobile is null or mobile ~ '^\+447[0-9]{9}$');

create table maintenance.reminder_text_counts (
  company_id uuid not null,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  sent integer not null default 0 check (sent >= 0),
  primary key (company_id, month)
);

grant select, insert, update, delete on all tables in schema maintenance to wagonwise_app;

alter table maintenance.reminder_settings enable row level security;
create policy company_rows on maintenance.reminder_settings
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
alter table maintenance.reminder_text_counts enable row level security;
create policy company_rows on maintenance.reminder_text_counts
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
