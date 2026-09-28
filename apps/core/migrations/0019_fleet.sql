-- Fleet vehicles, Phase 2 tech design doc §3's `fleet` context, first slice (docs/progress.md):
-- company-owned vehicles, distinct from routing.vehicle_profiles (a driver's own personal
-- profile). Dispatch/jobs aren't built yet — this is just the vehicle record.
create schema if not exists fleet;

-- double precision, not numeric, same reasoning as routing.vehicle_profiles' own dimension
-- columns (0003_routing.sql): real-world measurements, and node-postgres returns numeric as a
-- string.
create table fleet.vehicles (
  id uuid primary key,
  company_id uuid not null,
  name text not null,
  height_m double precision not null,
  width_m double precision not null,
  length_m double precision not null,
  gross_weight_t double precision not null,
  axle_weight_t double precision
);

-- listForCompany's own query, and the future authorization/dispatch queries that will also
-- filter by company.
create index vehicles_company_id_idx on fleet.vehicles (company_id);
