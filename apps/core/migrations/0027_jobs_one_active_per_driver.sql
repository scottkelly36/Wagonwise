-- A driver can be on at most one job at a time (design doc §3). assignJob checks first and returns
-- DriverBusy; this makes the database refuse the rare case of two dispatchers assigning the same
-- free driver at the same moment.
create unique index jobs_one_active_per_driver_idx on jobs.jobs (driver_id)
  where driver_id is not null
    and status in ('assigned', 'accepted', 'at_pickup', 'loaded', 'en_route', 'at_delivery');
