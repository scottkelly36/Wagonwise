-- P2-M3 (first slice): the Job domain model and the "create job" use case only (Phase 2 tech
-- design doc §3/§5). No dispatch, status transitions past 'draft', or driver-app/portal UI yet —
-- docs/progress.md.
create schema if not exists jobs;

create table jobs.jobs (
  id uuid primary key,
  company_id uuid not null,
  reference text not null,
  status text not null check (status in (
    'draft', 'assigned', 'accepted', 'at_pickup', 'loaded', 'en_route', 'at_delivery',
    'delivered', 'cancelled', 'failed'
  )),
  -- Set once dispatch (not built yet) assigns the job; null until then.
  driver_id uuid,
  vehicle_id uuid,
  route_plan_id uuid,
  planned_start timestamptz,
  due_by timestamptz,
  created_at timestamptz not null,
  -- One entry per status reached, in order (design doc §3: "every change is timestamped and,
  -- where available, stamped with GPS position"); jsonb for the same reason as
  -- companies.staff_audit's `details` (0022_staff_audit.sql) — a small append-style log, not
  -- columns to query on yet.
  timeline jsonb not null default '[]'::jsonb
);

-- Same reasoning as fleet.vehicles (0019_fleet.sql): the RLS predicate below filters by
-- company_id on every query, and the future list/dispatch queries will too.
create index jobs_company_id_idx on jobs.jobs (company_id);

-- A job's pickup(s) then delivery(ies) (design doc §3's `JobStop`), ordered by `sequence`.
-- geography(Point, 4326), not geometry — same reasoning as congestion.reports (0013_congestion.sql):
-- routing/dispatch work later needs metres on a sphere, not degrees.
create table jobs.job_stops (
  job_id uuid not null references jobs.jobs (id) on delete cascade,
  sequence integer not null,
  kind text not null check (kind in ('pickup', 'delivery')),
  name text not null,
  location geography(Point, 4326) not null,
  window_from timestamptz,
  window_to timestamptz,
  notes text,
  primary key (job_id, sequence)
);

-- ---- Row-Level Security (P2-M1.7 pattern, 0021_rls.sql) -----------------------------------
-- `jobs` didn't exist when 0021 ran, so it needs its own grants (0021's per-schema default
-- privileges only cover schemas that already existed then).
grant usage on schema jobs to wagonwise_app;
grant select, insert, update, delete on all tables in schema jobs to wagonwise_app;
grant usage, select on all sequences in schema jobs to wagonwise_app;
alter default privileges in schema jobs grant select, insert, update, delete on tables to wagonwise_app;
alter default privileges in schema jobs grant usage, select on sequences to wagonwise_app;

alter table jobs.jobs enable row level security;
create policy company_rows on jobs.jobs
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());

-- No company_id of its own: a stop is visible exactly when its job is (the subquery is itself
-- filtered by the policy above) — same "via_" pattern as companies.staff_sessions (0021_rls.sql).
alter table jobs.job_stops enable row level security;
create policy via_job on jobs.job_stops
  using (exists (select 1 from jobs.jobs j where j.id = job_id))
  with check (exists (select 1 from jobs.jobs j where j.id = job_id));
