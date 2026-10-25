-- SOS: a driver presses and holds a button in the app, and the companies they drive for are told where they are: the three
-- words for the spot, their name and contact, the vehicle and the job they are on. WagonWise does not contact the emergency
-- services; the driver is told so on the screen, next to a button that calls 999.
--
-- One row per company told. A driver on a job tells that job's company; otherwise every company they are an active member of.
-- A driver with no company stores nothing: the app just shows them their three words. The driver's details are copied into the
-- row when it is made, so the record says what the office was told, whatever changes later. Kept for the retention period, then
-- deleted (open ones are never deleted by that); deleted with the driver's account.
create schema if not exists sos;

create table sos.alerts (
  id uuid primary key,
  -- Chosen by the app for one press, so a retry does not tell the office twice. One press can tell several companies.
  request_id uuid not null,
  company_id uuid not null,
  driver_id uuid not null,
  driver_name text,
  -- How the driver signs in (a phone number or an email address), as the way to ring them.
  driver_contact text,
  vehicle_name text,
  vehicle_registration text,
  job_reference text,
  location geography(Point, 4326) not null,
  -- The three words and nearest town, when the lookup answered.
  words text,
  nearest_place text,
  status text not null check (status in ('open', 'resolved', 'cancelled')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  -- Who in the office dealt with it (resolved), when.
  resolved_by uuid,
  resolved_at timestamptz,
  unique (request_id, company_id)
);
create index alerts_company_status_idx on sos.alerts (company_id, status, created_at desc);
create index alerts_driver_idx on sos.alerts (driver_id);

grant usage on schema sos to wagonwise_app;
grant select, insert, update, delete on all tables in schema sos to wagonwise_app;
alter default privileges in schema sos grant select, insert, update, delete on tables to wagonwise_app;

alter table sos.alerts enable row level security;

-- The company's staff (and WagonWise) read and change their company's alerts.
create policy company_rows on sos.alerts
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());

-- A driver reads and changes only their own alerts (to say they are all right), and makes one only for a company they are an
-- active member of: the database checks, as for places, so the boundary is not only the application's.
create policy driver_rows on sos.alerts
  using (driver_id = public.rls_driver_id())
  with check (
    driver_id = public.rls_driver_id()
    and company_id in (
      select l.company_id from fleet.driver_links l
      where l.driver_id = public.rls_driver_id() and l.status = 'active'
    )
  );
