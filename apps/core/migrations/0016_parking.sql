-- Safe parking spots, M9 (field-testing request, 2026-09-27): driver-vouched places to park an
-- HGV (laybys, truck stops). A separate schema/module on purpose (design discussion, same day) —
-- unlike hazards it isn't a restriction/danger a route is checked against, and unlike congestion
-- it isn't a decaying condition with a wait-time-derived expiry: it's a persistent point of
-- interest with no expiry at all.
create schema if not exists parking;

-- geography(Point, 4326), not geometry — same reasoning as hazards.reports/congestion.reports:
-- findNearbyLine's ST_DWithin needs metres on a sphere, not degrees.
create table parking.safe_parking_spots (
  id uuid primary key,
  reporter_id uuid not null,
  location geography(Point, 4326) not null,
  note text,
  reported_at timestamptz not null
);

-- findNearbyLine's ST_DWithin (the map-marker query).
create index safe_parking_spots_location_idx on parking.safe_parking_spots using gist (location);
