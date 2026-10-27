-- Pump prices by station, copied from the government's Fuel Finder (GOV.UK, Open Government Licence). A job in core replaces the
-- whole copy every hour or so; nothing else writes here. Our own copy, because "cheapest diesel near here" needs a spatial query
-- and the service allows only 100 requests a minute and one at a time. A separate schema and module on purpose: a pump price is
-- not a hazard, not a place to park, and belongs to no company, so there is no row-level policy (no company_id anywhere).
--
-- To undo: drop schema fuelprices cascade;
create schema if not exists fuelprices;

create table fuelprices.stations (
  -- Fuel Finder's own station id (`node_id`): it stays the same from one refresh to the next.
  id text primary key,
  name text not null,
  brand text,
  address_line text,
  city text,
  postcode text,
  phone text,
  -- geography, not geometry: ST_DWithin needs metres on a sphere (as parking, hazards and cameras).
  location geography(Point, 4326) not null,
  is_motorway boolean not null,
  is_supermarket boolean not null,
  -- Closed for now or for good: kept so a reader can leave it out, not deleted.
  closed boolean not null,
  amenities text[] not null default '{}'
);

create index stations_location_idx on fuelprices.stations using gist (location);

create table fuelprices.prices (
  station_id text not null references fuelprices.stations (id) on delete cascade,
  -- Fuel Finder's grades, in capitals. A lorry runs on B7_STANDARD.
  fuel_type text not null check (fuel_type in ('E10', 'E5', 'B7_STANDARD', 'B7_PREMIUM', 'B10', 'HVO')),
  -- Pence per litre (198.9 is £1.989). The range matches the client's check: a price typed in pounds never gets this far.
  pence_per_litre numeric(5, 1) not null check (pence_per_litre between 50 and 500),
  -- When the retailer last reported it. Many stations report rarely, so a reader must show how old a price is.
  updated_at timestamptz not null,
  primary key (station_id, fuel_type)
);

-- "The cheapest of this fuel", before the spatial filter narrows it.
create index prices_fuel_cheapest_idx on fuelprices.prices (fuel_type, pence_per_litre);

-- One row: when the copy was last replaced, so a reader can say how fresh all of it is.
create table fuelprices.refreshes (
  only_row boolean primary key default true check (only_row),
  refreshed_at timestamptz not null,
  stations integer not null,
  prices integer not null
);

-- The refresh job runs inside core as the app role, so it needs to write (0021's per-schema grants only cover schemas that
-- existed then).
grant usage on schema fuelprices to wagonwise_app;
grant select, insert, update, delete on all tables in schema fuelprices to wagonwise_app;
alter default privileges in schema fuelprices grant select, insert, update, delete on tables to wagonwise_app;
