-- Parking spots get what a driver wants to know before pulling in, and a source, so spots that did not come from a driver can
-- sit beside the drivers' own: WagonWise staff add and edit them from the dashboard, and a starting set is imported once from
-- OpenStreetMap (0061). Every extra is nullable: null means nobody has said, which is different from "no".
alter table parking.safe_parking_spots
  alter column reporter_id drop not null,
  add column source text not null default 'driver' check (source in ('driver', 'admin', 'osm')),
  add column osm_id text,
  add column name text check (name is null or char_length(name) <= 120),
  add column capacity integer check (capacity is null or capacity >= 0),
  add column paid boolean,
  add column toilets boolean,
  add column showers boolean,
  add column shop boolean,
  add column food boolean,
  add column fuel boolean,
  add column lit boolean,
  add column secure boolean,
  add constraint safe_parking_spots_driver_has_reporter check ((source = 'driver') = (reporter_id is not null));

-- An imported place is never inserted twice.
create unique index safe_parking_spots_osm_id_idx on parking.safe_parking_spots (osm_id) where osm_id is not null;
