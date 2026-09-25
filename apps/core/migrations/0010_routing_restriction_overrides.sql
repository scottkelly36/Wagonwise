-- M8: manually-curated corrections for restriction data Valhalla/OSM gets wrong or is missing
-- for the test area (design doc §9's "test-area restriction audit"). Same point + buffered-zone
-- shape as a hazard report's own avoid area (routing/domain/geo.ts's bufferPoint) — an override
-- is routing's own data, not hazards', so it lives in routing's schema, needs no cross-module
-- read, and is folded into planRoute alongside hazard avoidance candidates via the same
-- ReportedObstruction/applies() machinery.
--
-- No CRUD endpoint or admin UI in Phase 1 — seeded manually, same precedent as
-- identity.invite_codes ("Seeded manually for Phase 1... out of scope").

create table routing.restriction_overrides (
  id uuid primary key,
  kind text not null check (kind in ('height', 'width', 'weight', 'prohibition')),
  limit_value double precision,
  location geography(Point, 4326) not null,
  note text,
  created_at timestamptz not null default now()
);

create index restriction_overrides_location_idx on routing.restriction_overrides using gist (location);
