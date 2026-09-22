-- M2.5: routing.route_plans (design doc §3/§9). RoutePlan is immutable (decision 10) —
-- insert-only, no update path.
--
-- geometry stored as plain text (the encoded polyline), not a PostGIS LineString, and
-- origin/destination as plain lat/lon columns, not PostGIS points — nothing queries a RoutePlan
-- spatially yet (on-route hazard detection is M3/M6 territory). Revisit when something does;
-- until then this avoids a decode/re-encode step with no consumer.

create table routing.route_plans (
  id uuid primary key,
  driver_id uuid not null,
  profile_id uuid not null,
  origin_lat double precision not null,
  origin_lon double precision not null,
  destination_lat double precision not null,
  destination_lon double precision not null,
  geometry text not null,
  distance_km double precision not null,
  duration_min double precision not null,
  -- Always '[]' for now (M2.5 deviations, docs/progress.md) — the columns exist so nothing about
  -- storage has to change once avoided-restriction/hazard data is real.
  avoided_restrictions jsonb not null default '[]',
  hazards_on_route jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- "RoutePlans created in the last 6 hours" (decision 10) is the read the alerts subscriber (M6)
-- will make.
create index route_plans_driver_id_created_at_idx on routing.route_plans (driver_id, created_at desc);
