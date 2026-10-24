-- Public places: a driver can make one of their own (personal) places visible to every WagonWise driver, and back.
-- Asked for by drivers: the farm gates and yards one driver has marked help the next, whoever they drive for.
--
-- Only a personal place (no company) can be public, which the check below enforces: a company's places, such as a
-- customer's site, are never made public by one driver's tap. Sharing a place with a company turns public off.
-- The marker's identity is never sent with a public place (created_by stays in the table, not in any answer).
alter table places.saved_places add column is_public boolean not null default false;
alter table places.saved_places add constraint saved_places_public_is_personal
  check (not is_public or company_id is null);
create index saved_places_public_idx on places.saved_places using gist (location) where is_public;

-- Any driver (and nobody but the owner, company or admin otherwise) can read a public place. Policies are permissive, so
-- this adds to company_and_member_driver_rows rather than replacing it; writes still need that policy.
create policy public_places_are_readable on places.saved_places for select using (is_public);

-- A driver reporting a public place that is wrong, offensive or someone's private land. One report a driver a place. A
-- place with enough reports from different drivers stops being shown to others (the owner still sees it); a person at
-- WagonWise then decides. Not tied to a company, so no row-level policy: only places' own queries read it.
create table places.place_reports (
  place_id uuid not null references places.saved_places (id) on delete cascade,
  reporter_id uuid not null,
  reason text not null check (reason in ('wrong_place', 'offensive', 'private_property', 'other')),
  created_at timestamptz not null,
  primary key (place_id, reporter_id)
);
