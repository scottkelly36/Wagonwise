-- Speed and red-light camera positions, so the trip screen can warn a driver of one ahead. Fixed points only, seeded once from
-- OpenStreetMap by migration 0075 (© OpenStreetMap contributors, ODbL). Nothing in the app writes here: the app role can only
-- read. A separate schema and module on purpose: a camera is not a hazard a route avoids and not a place to park, it is a
-- permanent point of interest with no expiry and no driver reports.
--
-- To undo: drop schema cameras cascade;
create schema if not exists cameras;

create table cameras.speed_cameras (
  id uuid primary key,
  osm_id text not null unique,
  -- geography, not geometry: ST_DWithin needs metres on a sphere (as parking and hazards).
  location geography(Point, 4326) not null,
  kind text not null check (kind in ('fixed', 'average', 'red_light')),
  -- The limit the map gives for the camera, in mph, when it says one.
  maxspeed_mph integer check (maxspeed_mph is null or maxspeed_mph between 5 and 70)
);

create index speed_cameras_location_idx on cameras.speed_cameras using gist (location);

-- Read only for the app (0021's per-schema grants only cover schemas that existed then).
grant usage on schema cameras to wagonwise_app;
grant select on all tables in schema cameras to wagonwise_app;
alter default privileges in schema cameras grant select on tables to wagonwise_app;
