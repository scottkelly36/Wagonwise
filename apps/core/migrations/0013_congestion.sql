-- Congestion tracking, phase 1 (field-testing request, 2026-09-26): crowd-sourced "traffic here,
-- ~N min" reports. A separate schema/module from hazards on purpose (design discussion, same
-- day) — this is a decaying road condition with its own short, wait-time-derived expiry, not a
-- persistent point obstruction checked against a vehicle's dimensions, and hazards' schema
-- wasn't created for this module (0001_init.sql only knows about identity/routing/hazards/
-- feedback/outbox).
create schema if not exists congestion;

-- geography(Point, 4326), not geometry — same reasoning as hazards.reports (0005_hazards.sql):
-- findNearbyLine's ST_DWithin needs metres on a sphere, not degrees.
create table congestion.reports (
  id uuid primary key,
  reporter_id uuid not null,
  location geography(Point, 4326) not null,
  estimated_wait_minutes integer not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

-- findNearbyLine's ST_DWithin (the map-marker query, and later phase 2's WebTRIS matching).
create index reports_location_idx on congestion.reports using gist (location);

-- findNearbyLine filters to `expires_at > now()` on every read — no separate expiry job like
-- hazards' `expireHazards` (nothing re-activates a congestion report the way confirm() does for
-- a hazard, so there's no status to transition, just a point in time to compare against).
create index reports_expires_at_idx on congestion.reports (expires_at);
