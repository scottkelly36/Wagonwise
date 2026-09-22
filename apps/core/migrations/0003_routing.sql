-- M2.2: routing's first table (design doc §3/§9). `driver_id` is not a foreign key — routing
-- does not import identity's schema or tables, matching the module boundary in code (routing
-- defines its own DriverId type rather than reaching into identity's).
--
-- Dimensions as `double precision`, not `numeric`: these are real-world measurements (metres,
-- tonnes), not currency, so float precision is fine and avoids node-postgres returning numeric
-- columns as strings.

create table routing.vehicle_profiles (
  id uuid primary key,
  driver_id uuid not null,
  name text not null,
  height_m double precision not null,
  width_m double precision not null,
  length_m double precision not null,
  gross_weight_t double precision not null,
  axle_weight_t double precision
);

-- listForDriver(driverId) is the read every vehicle-profile-picker screen makes.
create index vehicle_profiles_driver_id_idx on routing.vehicle_profiles (driver_id);
