-- P2-M5.5: proof of delivery. A dispatcher can mark a job as needing one at creation
-- (requires_proof_of_delivery); whether one's actually been attached lives in its own table, not
-- a column, since it's an upload (potentially several MB), not a fact worth loading on every plain
-- job read the way the rest of jobs.jobs is. No S3-style object store yet (deferred until there's
-- real photo volume or a dashboard viewer to justify one) — the bytes live in Postgres directly.
alter table jobs.jobs add column requires_proof_of_delivery boolean not null default false;

create table jobs.proof_of_delivery (
  -- One photo per job: retaking replaces it, rather than keeping a history.
  job_id uuid primary key references jobs.jobs (id) on delete cascade,
  content_type text not null,
  data bytea not null,
  captured_at timestamptz not null
);

-- No explicit grant needed: 0026_jobs.sql's `alter default privileges in schema jobs` already
-- covers any table created later in this schema (same pattern 0028_fleet_driver_links.sql's new
-- tables relied on).

-- Same "via_" pattern as jobs.job_stops (0026_jobs.sql): no company_id of its own, visible exactly
-- when its job is.
alter table jobs.proof_of_delivery enable row level security;
create policy via_job on jobs.proof_of_delivery
  using (exists (select 1 from jobs.jobs j where j.id = job_id))
  with check (exists (select 1 from jobs.jobs j where j.id = job_id));
