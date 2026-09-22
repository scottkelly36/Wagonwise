-- M3.3: hazards.reports (design doc §3/§5/§9). Unlike routing.route_plans (M2.5, decision 55),
-- this one genuinely needs a spatial column from day one: findNearby's merge-duplicate check
-- (M3.2) and the on-route detection query (M3.5) both run ST_DWithin against it, so there's a
-- real consumer for real PostGIS geometry, not a speculative one.
--
-- geography(Point, 4326), not geometry: geography's distance/ST_DWithin work in metres on a
-- sphere, matching "within ~50m" (design doc §5) and "within 30 metres" (design doc §5's
-- on-route detection) directly — a geometry column would need every query to reason in degrees.
--
-- measurement is three nullable columns, not a jsonb blob: it's a fixed three-field shape
-- (kind/value/unit) that's either fully present or fully absent, matching Dimensions'
-- double-precision columns (decision 48) rather than avoidedRestrictions' jsonb (decision 54,
-- genuinely open-shaped and always empty for now). All three are null together or none are.

create table hazards.reports (
  id uuid primary key,
  reporter_id uuid not null,
  type text not null,
  location geography(Point, 4326) not null,
  note text,
  measurement_kind text,
  measurement_value double precision,
  measurement_unit text,
  source text not null,
  confirmations integer not null default 0,
  dismissals integer not null default 0,
  status text not null,
  expires_at timestamptz,
  created_at timestamptz not null,
  constraint measurement_together check (
    (measurement_kind is null) = (measurement_value is null)
    and (measurement_kind is null) = (measurement_unit is null)
  )
);

-- findNearby's ST_DWithin (M3.2's merge check, M3.5's on-route query) and the future
-- map-viewport bounding-box read (design doc §5) both need this.
create index reports_location_idx on hazards.reports using gist (location);

-- findExpirable(now): active reports whose expiry has passed.
create index reports_status_expires_at_idx on hazards.reports (status, expires_at)
  where status = 'active';
