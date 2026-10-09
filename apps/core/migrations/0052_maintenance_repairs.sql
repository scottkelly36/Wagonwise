-- Maintenance, slice 4: a defect a driver found becomes a repair somebody books (Phase 3 M4).
--
-- A repair is a one-off job on a vehicle with a due date, linked to the defect that caused it. Booking one marks the
-- defect seen; finishing one can mark the defect fixed, which is what releases a vehicle a firm has chosen to hold
-- back for a "do not drive" defect. The name, vehicle and seriousness are kept as they were when it was booked, so the
-- repair reads the same whatever happens to the check it came from. The defect is another module's, so `defect_id`
-- is a plain id, not a foreign key.
create table maintenance.repairs (
  id uuid primary key,
  company_id uuid not null,
  defect_id uuid not null,
  vehicle_id uuid not null,
  vehicle_name text not null,
  title text not null check (char_length(title) between 1 and 200),
  severity text not null check (severity in ('advisory', 'do_not_drive')),
  due_date date not null,
  -- open: to do. done: finished. cancelled: booked in error.
  status text not null check (status in ('open', 'done', 'cancelled')),
  note text check (note is null or char_length(note) <= 500),
  done_on date,
  created_at timestamptz not null,
  created_by uuid,
  completed_at timestamptz,
  completed_by uuid,
  check ((status = 'done') = (done_on is not null))
);

-- One repair open per defect: booking again returns the one already booked.
create unique index repairs_one_open_per_defect_idx on maintenance.repairs (defect_id) where status = 'open';
create index repairs_company_status_idx on maintenance.repairs (company_id, status, due_date);

grant select, insert, update, delete on all tables in schema maintenance to wagonwise_app;

alter table maintenance.repairs enable row level security;
create policy company_rows on maintenance.repairs
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
