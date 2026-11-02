-- Road and lane closures on the strategic road network (motorways and major A roads), copied from National Highways' Road and Lane
-- Closures feed (DATEX II, v2.0; their Transport Data Feeds licence, which asks for the credit "Powered by National Highways'
-- Transport Data Feeds"). A job in core replaces the whole copy every ten minutes or so; nothing else writes here. Our own copy,
-- because the feed is one 10 MB file rebuilt on every request, limited to 10 requests a minute, and a driver needs "what is
-- closed near me" as a spatial query. A separate schema and module on purpose: a closure is not a driver-reported hazard and
-- belongs to no company, so there is no row-level policy (no company_id anywhere).
--
-- To undo: drop schema closures cascade;
create schema if not exists closures;

create table closures.closures (
  -- The feed's own id for the record. It stays the same as the scheme is updated.
  id text primary key,
  situation_id text not null,
  -- 'full': a whole carriageway, slip road or link road is shut. 'lane': lanes (or the hard shoulder) are shut and the road stays open.
  kind text not null check (kind in ('full', 'lane')),
  -- 'suspended' is set up but paused: not in force right now, so readers leave it out.
  status text not null check (status in ('active', 'planned', 'suspended')),
  road text,
  direction text,
  description text not null,
  location_text text,
  cause text,
  -- The whole window the scheme says it may apply. The feed gives a start and an end, not which nights inside it.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  lanes_closed integer not null default 0 check (lanes_closed >= 0),
  -- Where the map draws it: the middle of the first line. geography, not geometry: ST_DWithin needs metres on a sphere.
  position geography(Point, 4326) not null,
  -- Where it runs. One or more lines; a closure of a whole junction has several.
  geometry geography(MultiLineString, 4326) not null,
  -- When National Highways last changed the record.
  updated_at timestamptz not null,
  constraint window_is_forward check (ends_at > starts_at)
);

create index closures_position_idx on closures.closures using gist (position);
create index closures_geometry_idx on closures.closures using gist (geometry);
-- "Not over yet", before the spatial filter narrows it.
create index closures_ends_at_idx on closures.closures (ends_at);

-- One row: when the copy was last replaced, so a reader can say how fresh all of it is.
create table closures.refreshes (
  only_row boolean primary key default true check (only_row),
  refreshed_at timestamptz not null,
  closures integer not null
);

-- The refresh job runs inside core as the app role, so it needs to write (0021's per-schema grants only cover schemas that
-- existed then).
grant usage on schema closures to wagonwise_app;
grant select, insert, update, delete on all tables in schema closures to wagonwise_app;
alter default privileges in schema closures grant select, insert, update, delete on tables to wagonwise_app;
