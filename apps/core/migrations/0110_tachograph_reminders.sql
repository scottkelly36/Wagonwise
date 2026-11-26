-- Tachograph download reminders: the office is emailed, and a driver is pushed, when a download is coming due or overdue.
-- Each message is sent once for each driver card or vehicle unit, for the download it follows (the day of the latest file) and for
-- each stage (due soon, urgent, due today, then each week overdue), so a new file starts the count again and a restart sends nothing twice.

-- The firm's switch. On unless the firm turns it off; it only matters once the firm has sent or uploaded a file.
alter table tachograph.settings add column reminders_enabled boolean not null default true;

create table tachograph.reminder_log (
  company_id uuid not null,
  kind text not null check (kind in ('driver_card', 'vehicle_unit')),
  -- The driver's id for a card, the vehicle's id for a unit.
  subject_id uuid not null,
  -- The download this follows: when a newer file arrives the reminders for it start afresh.
  downloaded_on date not null,
  stage text not null,
  sent_at timestamptz not null,
  primary key (company_id, kind, subject_id, downloaded_on, stage)
);
create index reminder_log_sent_idx on tachograph.reminder_log (sent_at);

alter table tachograph.reminder_log enable row level security;
create policy company_rows on tachograph.reminder_log
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
