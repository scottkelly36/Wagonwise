-- Tachograph files: a copy of a driver card or a vehicle unit, kept unaltered for the firm (docs/tachograph-download-scope.md, stage 1).
-- Sent from the driver app (a driver's own card, to a firm they drive for, which has switched that on) or uploaded in the portal (either
-- kind). Nothing is read out of the file: the bytes are stored as received with a SHA-256 so a copy that was changed can be told, and
-- the day the download was made is what the uploader says, because the file is not opened.
create schema if not exists tachograph;

-- The firm's choices. Drivers may send from the app only where the firm has switched it on (off until chosen). Files are kept at
-- least 12 months, the period operators must be able to produce records for.
create table tachograph.settings (
  company_id uuid primary key,
  drivers_may_send boolean not null default false,
  retention_months integer not null default 12 check (retention_months between 12 and 120),
  updated_at timestamptz not null,
  updated_by uuid
);

create table tachograph.files (
  id uuid primary key,
  company_id uuid not null,
  kind text not null check (kind in ('driver_card', 'vehicle_unit')),
  -- A driver card file names the driver whose card it is; a vehicle unit file names the company vehicle.
  driver_id uuid,
  vehicle_id uuid,
  file_name text not null,
  size_bytes integer not null check (size_bytes > 0),
  -- Hex SHA-256 of the bytes. The same bytes are kept once for a company.
  sha256 text not null,
  data bytea not null,
  -- The day the download was made, as the uploader said (not read from the file).
  downloaded_on date not null,
  uploaded_at timestamptz not null,
  -- Who sent it: a driver (from the app) or a member of staff (the portal). Neither is cleared when an account goes: the file is the
  -- firm's record, and the firm has a duty to keep it.
  uploaded_by_driver_id uuid,
  uploaded_by_staff_id uuid,
  -- The notice the driver was shown, when it came from the app.
  wording_version integer,
  unique (company_id, sha256),
  check (
    (kind = 'driver_card' and driver_id is not null and vehicle_id is null)
    or (kind = 'vehicle_unit' and vehicle_id is not null and driver_id is null)
  )
);
create index files_company_downloaded_idx on tachograph.files (company_id, downloaded_on desc);
create index files_driver_idx on tachograph.files (driver_id) where driver_id is not null;
create index files_uploaded_idx on tachograph.files (uploaded_at);

grant usage on schema tachograph to wagonwise_app;
grant select, insert, update, delete on all tables in schema tachograph to wagonwise_app;
alter default privileges in schema tachograph grant select, insert, update, delete on tables to wagonwise_app;

alter table tachograph.settings enable row level security;
alter table tachograph.files enable row level security;

create policy company_rows on tachograph.settings
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
-- A driver reads the firm's switch for a company they are an active member of, so the app offers sending only where it is on.
create policy driver_reads_own_companies on tachograph.settings for select
  using (
    company_id in (
      select company_id from fleet.driver_links
      where driver_id = public.rls_driver_id() and status = 'active'
    )
  );

create policy company_rows on tachograph.files
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
-- A driver reads the files of their own card (to see when they last sent one), and may add one only for themselves, to a company they
-- are an active member of. They cannot change or delete one: it is the firm's record.
create policy driver_reads_own on tachograph.files for select
  using (kind = 'driver_card' and driver_id = public.rls_driver_id());
create policy driver_adds_own on tachograph.files for insert
  with check (
    kind = 'driver_card'
    and driver_id = public.rls_driver_id()
    and uploaded_by_driver_id = public.rls_driver_id()
    and company_id in (
      select company_id from fleet.driver_links
      where driver_id = public.rls_driver_id() and status = 'active'
    )
  );
