-- A driver is told by push notification when a job is assigned to them. What happened to that notice is kept on the job
-- (how it went, to how many devices, how many tries, and when the driver first opened the job) so the office can see it
-- and send it again. The columns sit on jobs.jobs, so the existing company and driver row policies already cover them.
alter table jobs.jobs
  add column notice_result text check (notice_result in ('sent', 'no_device', 'failed')),
  add column notice_devices integer not null default 0,
  add column notice_attempts integer not null default 0,
  add column notice_at timestamptz,
  add column seen_at timestamptz;
