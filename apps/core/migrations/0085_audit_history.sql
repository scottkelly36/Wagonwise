-- The history behind the audit pack. A defect used to keep only its latest change of status (checks.defects.status_changed_at and
-- status_changed_by), and a maintenance due date that was corrected overwrote the old one. Both now leave a row behind.

-- Every change of a defect's status: open, acknowledged (seen by the office) or fixed, with who and when.
create table checks.defect_events (
  id uuid primary key,
  defect_id uuid not null references checks.defects (id) on delete cascade,
  company_id uuid not null,
  status text not null check (status in ('open', 'acknowledged', 'fixed')),
  at timestamptz not null,
  -- The staff account that made the change.
  by uuid
);
create index defect_events_defect_idx on checks.defect_events (defect_id, at);

grant select, insert, update, delete on checks.defect_events to wagonwise_app;

alter table checks.defect_events enable row level security;
create policy company_rows on checks.defect_events
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());

-- A defect changed before this existed has only its latest change on record; that one becomes its first row, so the history
-- is never empty for a defect that has been handled. Earlier steps cannot be recovered.
insert into checks.defect_events (id, defect_id, company_id, status, at, by)
select gen_random_uuid(), id, company_id, status, status_changed_at, status_changed_by
from checks.defects
where status_changed_at is not null;

-- Every time a due date is entered or corrected by hand (the first date, a correction, a spreadsheet import, the MOT and tax fill-in).
-- Not when work is recorded as done: that is in maintenance.history, with the next date it set.
create table maintenance.date_changes (
  id uuid primary key,
  company_id uuid not null,
  vehicle_id uuid not null,
  item_type_id uuid not null references maintenance.item_types (id),
  item_name text not null,
  -- Null the first time a date was entered for this vehicle and item.
  from_due date,
  to_due date not null,
  changed_by uuid,
  changed_at timestamptz not null
);
create index date_changes_vehicle_idx on maintenance.date_changes (vehicle_id, changed_at);

grant select, insert, update, delete on maintenance.date_changes to wagonwise_app;

alter table maintenance.date_changes enable row level security;
create policy company_rows on maintenance.date_changes
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
