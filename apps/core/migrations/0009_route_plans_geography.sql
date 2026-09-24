-- M6.4: routing.route_plans gains a real PostGIS geography column. Decision 10 (M2.5) deferred
-- this exactly until "something queries a RoutePlan spatially" — the reroute-on-hazard
-- subscriber now does (design doc §6 step 1: "RoutePlans... whose geometry is within 30m of the
-- new hazard"). `geometry` (the encoded polyline, decision 52) stays as the source of truth for
-- decoding back into a route to show a driver; `geometry_geog` is a derived, queryable copy,
-- computed once at insert time (`PostgresRoutePlanRepository.save()`) from the same points.
--
-- Nullable, and existing rows are not backfilled: RoutePlan is immutable/insert-only (decision
-- 10), Phase 1 has no production data yet to preserve, and a plan with a null geometry_geog
-- simply never matches a spatial query — the same "no test/production risk, nothing to migrate
-- forward" reasoning M6.1's dead-letter design already used for not adding a column to a
-- previously-shipped table.

alter table routing.route_plans add column geometry_geog geography(LineString, 4326);

create index route_plans_geometry_geog_idx on routing.route_plans using gist (geometry_geog);

-- Records a reroute alert actually sent, guarding both "one alert per hazard per trip/plan"
-- and "a cap per trip per hour" (design doc §6's guardrails). `subject_id` is either an
-- `active_trips.id` or a `route_plans.id` (whichever the alert was raised for) — a driver's
-- affected unit for a hazard is one or the other, never both, so one nullable-neither column
-- with a `subject_type` discriminator avoids two mutually-exclusive nullable FK columns for no
-- benefit (nothing else references this table).
create table routing.reroute_alerts (
  id uuid primary key,
  hazard_id text not null,
  subject_type text not null check (subject_type in ('active_trip', 'route_plan')),
  subject_id uuid not null,
  driver_id uuid not null,
  new_route_plan_id uuid not null references routing.route_plans (id),
  sent_at timestamptz not null default now()
);

-- The dedupe check: "has this hazard already alerted this subject".
create unique index reroute_alerts_hazard_subject_idx
  on routing.reroute_alerts (hazard_id, subject_type, subject_id);

-- The per-trip-per-hour cap check.
create index reroute_alerts_subject_sent_at_idx
  on routing.reroute_alerts (subject_type, subject_id, sent_at desc);
