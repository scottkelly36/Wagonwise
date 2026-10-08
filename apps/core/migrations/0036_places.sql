-- Saved places: somewhere a company's drivers have marked, so the next job there goes to the right spot.
-- First use: a farm whose postcode lands miles from the gate. The driver marks the real entrance once,
-- with a note ("gate on the left, tight turn"), and everyone at the company sees it for future jobs.
--
-- Company-wide, not per driver (owner's call, 2026-10-08): a farm is the company's farm. Staff of the
-- company and WagonWise admins see them through the company scope as every other company table; a driver
-- sees the places of any company they have an active link with (fleet.driver_links), so the boundary
-- Postgres enforces is the same one the application checks.
--
-- A driver with no company (an owner-driver on their own) marks personal places instead: company_id is
-- null and created_by is that driver, and only they see it. A place is always one or the other.
create schema if not exists places;

create table places.saved_places (
  id uuid primary key,
  -- Null for a personal place (a solo driver's own); then created_by says whose.
  company_id uuid,
  category text not null check (category in ('farm', 'yard', 'other')),
  name text not null check (char_length(name) between 1 and 80),
  note text check (note is null or char_length(note) <= 500),
  -- geography, as every other place on a map: ST_DWithin needs metres, not degrees.
  location geography(Point, 4326) not null,
  created_by uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (company_id is not null or created_by is not null)
);

create index saved_places_company_idx on places.saved_places (company_id);
create index saved_places_owner_idx on places.saved_places (created_by) where company_id is null;
create index saved_places_location_idx on places.saved_places using gist (location);

-- places did not exist when 0021 ran, so it needs its own grants (as jobs and fleet did).
grant usage on schema places to wagonwise_app;
grant select, insert, update, delete on all tables in schema places to wagonwise_app;
grant usage, select on all sequences in schema places to wagonwise_app;
alter default privileges in schema places grant select, insert, update, delete on tables to wagonwise_app;
alter default privileges in schema places grant usage, select on sequences to wagonwise_app;

alter table places.saved_places enable row level security;
create policy company_and_member_driver_rows on places.saved_places
  using (
    company_id = public.rls_company_id() or public.rls_platform_staff()
    or (company_id is null and created_by = public.rls_driver_id())
    or company_id in (
      select l.company_id from fleet.driver_links l
      where l.driver_id = public.rls_driver_id() and l.status = 'active'
    )
  )
  with check (
    company_id = public.rls_company_id() or public.rls_platform_staff()
    or (company_id is null and created_by = public.rls_driver_id())
    or company_id in (
      select l.company_id from fleet.driver_links l
      where l.driver_id = public.rls_driver_id() and l.status = 'active'
    )
  );
