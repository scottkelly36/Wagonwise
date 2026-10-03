-- P2-M6.1: where a driver is during a company job, for the dispatcher's live map (Phase 2 tech
-- design doc §6). One row per report the driver app sends (every ~30s, only while the job is
-- being driven — `jobs/domain/job.ts`'s `isTracked`). Location history is personal data
-- (AGENTS.md; design doc §9): nothing is stored outside an active job, and rows are meant to be
-- short-lived — there is no sweeper yet, see docs/progress.md's open items.
-- geography(Point, 4326), same as job_stops, for metres on a sphere later (ETA, geofences).
create table jobs.job_positions (
  job_id uuid not null references jobs.jobs (id) on delete cascade,
  recorded_at timestamptz not null,
  location geography(Point, 4326) not null,
  primary key (job_id, recorded_at)
);

-- The retention sweeper will delete by age across all jobs.
create index job_positions_recorded_at_idx on jobs.job_positions (recorded_at);

-- Grants: 0026_jobs.sql's default privileges already cover tables created later in this schema.
-- Same "visible exactly when its job is" policy as job_stops and proof_of_delivery, so a driver
-- (0030) and a company's staff each see only their own jobs' positions.
alter table jobs.job_positions enable row level security;
create policy via_job on jobs.job_positions
  using (exists (select 1 from jobs.jobs j where j.id = job_id))
  with check (exists (select 1 from jobs.jobs j where j.id = job_id));
