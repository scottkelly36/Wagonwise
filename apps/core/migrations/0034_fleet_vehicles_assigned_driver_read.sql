-- A driver being navigated for a job (the driver app's "Start") needs the measurements of the company
-- vehicle the job is assigned to. fleet.vehicles' only policy (0021_rls.sql) knows company and
-- platform staff, so a request in the `driver` data scope saw no vehicle at all, and the job could
-- never be navigated. The end-to-end test in composition/job-navigation-end-to-end.test.ts found it.
--
-- This adds a second, read-only policy (permissive policies combine with OR, so company and platform
-- access are untouched): a driver may see a vehicle only while it is assigned to one of their own
-- unfinished jobs. Not every vehicle in the company, and not one from a job that is over. The inner
-- query on jobs.jobs runs under jobs' own policy, which already lets a driver see their own jobs
-- (0030_jobs_driver_rls.sql).
create policy assigned_driver_read on fleet.vehicles
  for select
  using (
    exists (
      select 1 from jobs.jobs j
      where j.vehicle_id = fleet.vehicles.id
        and j.driver_id = public.rls_driver_id()
        and j.status in ('assigned', 'accepted', 'at_pickup', 'loaded', 'en_route', 'at_delivery')
    )
  );
