-- The UK weeks (Monday starts) in which each driver started at least one trip, for the "do drivers come back" view on the admin
-- usage page. Trips themselves are deleted after 30 days (ROUTE_RETENTION_DAYS) with their plans and positions, which is too
-- short to see whether drivers who joined in November are still driving in January. This keeps only a driver and a week: no
-- place, no time of day, no route. It is removed with the driver's other routing data when an account is deleted.
create table routing.driver_trip_weeks (
  driver_id uuid not null,
  week date not null check (extract(isodow from week) = 1),
  primary key (driver_id, week)
);

-- The trips still held (the last 30 days) give the weeks so far.
insert into routing.driver_trip_weeks (driver_id, week)
select distinct driver_id, date_trunc('week', started_at at time zone 'Europe/London')::date
from routing.active_trips
on conflict do nothing;
