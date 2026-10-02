-- P2-M5.1: the driver's own job routes run in the `driver` data scope (same as fleet's driver
-- routes, P2-M2.5), so Postgres enforces the boundary the application layer already does
-- (`jobs/application/authorization.ts`'s `canAdvance`/`canSeeJob`). jobs.jobs' policy only knew
-- about `company`/`platform` (0026_jobs.sql); reuses `public.rls_driver_id()`, which
-- 0028_fleet_driver_links.sql already defined for exactly this purpose.
drop policy company_rows on jobs.jobs;
create policy company_and_driver_rows on jobs.jobs
  using (
    company_id = public.rls_company_id() or public.rls_platform_staff()
    or driver_id = public.rls_driver_id()
  )
  with check (
    company_id = public.rls_company_id() or public.rls_platform_staff()
    or driver_id = public.rls_driver_id()
  );
