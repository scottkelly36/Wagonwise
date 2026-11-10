-- A vehicle's top speed, in km/h, so a route is timed at the speed it really goes (a limiter, or how
-- its driver drives it) instead of one flat figure for every vehicle. Nullable: blank keeps the
-- usual 55 mph, so every existing vehicle and profile is timed exactly as before.
-- double precision, same as the dimension columns beside it.
alter table routing.vehicle_profiles add column top_speed_kph double precision;
alter table fleet.vehicles add column top_speed_kph double precision;
