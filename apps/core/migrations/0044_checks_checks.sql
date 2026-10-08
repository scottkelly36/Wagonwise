-- Walk-round checks, slice 2: a driver does a check on the vehicle they are about to take out.
--
-- A check keeps a copy of the questions it was answered against (`items`), so editing the list afterwards never
-- alters a past check. Any defect it found becomes a row in `defects`, ready for the office to work through
-- (the office page follows in a later slice). Photos are sent on their own, one per question, because they are
-- large and the phone may be offline: a retake replaces the earlier one.
--
-- A driver sees and adds checks for the companies they have an active link with (fleet.driver_links), the same
-- boundary saved places use; a company's staff and WagonWise admins see the company's.

create table checks.checks (
  id uuid primary key,
  company_id uuid not null,
  template_id uuid not null,
  template_version integer not null,
  template_name text not null,
  vehicle_id uuid not null,
  vehicle_name text not null,
  driver_id uuid not null,
  -- The UK day it was received: "once per vehicle per day" counts these.
  check_day date not null,
  items jsonb not null,
  answers jsonb not null,
  result text not null check (result in ('clear', 'advisory', 'do_not_drive')),
  submitted_at timestamptz not null,
  -- When the driver finished it on the phone, which may be earlier than it arrived.
  device_completed_at timestamptz
);

create index checks_company_day_idx on checks.checks (company_id, check_day desc);
create index checks_vehicle_day_idx on checks.checks (vehicle_id, template_id, check_day);

create table checks.check_photos (
  check_id uuid not null references checks.checks (id) on delete cascade,
  item_id text not null,
  company_id uuid not null,
  content_type text not null,
  data bytea not null,
  captured_at timestamptz not null,
  primary key (check_id, item_id)
);

create table checks.defects (
  id uuid primary key,
  check_id uuid not null references checks.checks (id) on delete cascade,
  company_id uuid not null,
  vehicle_id uuid not null,
  vehicle_name text not null,
  item_id text not null,
  label text not null,
  severity text not null check (severity in ('advisory', 'do_not_drive')),
  -- What was found, in words: "Flagged as a defect", "Reading 70 psi, outside 80 to 120".
  detail text not null,
  note text,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'fixed')),
  created_at timestamptz not null,
  status_changed_at timestamptz
);

create index defects_company_status_idx on checks.defects (company_id, status, created_at desc);

grant select, insert, update, delete on all tables in schema checks to wagonwise_app;

-- A driver may read the lists of any company they have an active link with, to know what to check.
create policy driver_read_lists on checks.templates for select
  using (
    company_id in (
      select l.company_id from fleet.driver_links l
      where l.driver_id = public.rls_driver_id() and l.status = 'active'
    )
  );

alter table checks.checks enable row level security;
create policy company_rows on checks.checks
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
-- A driver sees their company's checks (so "done today" holds whoever did it) and adds only their own.
create policy driver_read on checks.checks for select
  using (
    company_id in (
      select l.company_id from fleet.driver_links l
      where l.driver_id = public.rls_driver_id() and l.status = 'active'
    )
  );
create policy driver_add on checks.checks for insert
  with check (
    driver_id = public.rls_driver_id()
    and company_id in (
      select l.company_id from fleet.driver_links l
      where l.driver_id = public.rls_driver_id() and l.status = 'active'
    )
  );

alter table checks.check_photos enable row level security;
create policy company_rows on checks.check_photos
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
-- A driver adds and replaces photos on their own checks, and cannot read a colleague's.
create policy driver_own on checks.check_photos
  using (check_id in (select c.id from checks.checks c where c.driver_id = public.rls_driver_id()))
  with check (check_id in (select c.id from checks.checks c where c.driver_id = public.rls_driver_id()));

alter table checks.defects enable row level security;
create policy company_rows on checks.defects
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
create policy driver_add on checks.defects for insert
  with check (
    check_id in (select c.id from checks.checks c where c.driver_id = public.rls_driver_id())
  );
