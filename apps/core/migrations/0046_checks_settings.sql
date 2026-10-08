-- Walk-round checks: each firm's own rules about sending a vehicle out. Both off by default: a firm that has not
-- asked for them is not held up.
--   required_before_job: a driver cannot accept a job on a vehicle until its check lists for the day are done.
--   block_on_do_not_drive: a vehicle with a "do not drive" defect not yet marked fixed is not sent out.
-- A company's staff and WagonWise admins read and change a company's row; a driver reads the row of a company they
-- have an active link with, because the rule is applied when the driver accepts a job.
create table checks.settings (
  company_id uuid primary key,
  required_before_job boolean not null default false,
  block_on_do_not_drive boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

grant select, insert, update, delete on all tables in schema checks to wagonwise_app;

alter table checks.settings enable row level security;
create policy company_rows on checks.settings
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
create policy driver_read on checks.settings for select
  using (
    company_id in (
      select l.company_id from fleet.driver_links l
      where l.driver_id = public.rls_driver_id() and l.status = 'active'
    )
  );

-- The same rule needs to see whether the vehicle has a "do not drive" defect still open, which only the
-- company's staff could read until now. A driver may read their company's defects, as they may its checks.
create policy driver_read on checks.defects for select
  using (
    company_id in (
      select l.company_id from fleet.driver_links l
      where l.driver_id = public.rls_driver_id() and l.status = 'active'
    )
  );
