-- Several drivers marking the same place no longer make several pins: a report within 30 metres of a spot is added to that spot.
-- Each driver's report is kept (with its note), so notes are not lost, and how many different drivers have vouched for a place and
-- when the last one did is worked out from them. The report id is the id the driver's phone made, so a retry is harmless and
-- "undo" removes that one report, not a spot other drivers have since vouched for.
create table parking.spot_reports (
  id uuid primary key,
  spot_id uuid not null references parking.safe_parking_spots (id) on delete cascade,
  reporter_id uuid not null,
  note text,
  reported_at timestamptz not null
);

create index spot_reports_spot_idx on parking.spot_reports (spot_id, reported_at desc);
create index spot_reports_reporter_idx on parking.spot_reports (reporter_id);

-- Every spot a driver reported already has its first report, with the same id as the spot, so an older phone's "undo" (which
-- sends the spot's id) still finds it.
insert into parking.spot_reports (id, spot_id, reporter_id, note, reported_at)
select id, id, reporter_id, note, reported_at
from parking.safe_parking_spots
where reporter_id is not null;

-- When anyone last vouched for the place (a driver's report, or its creation); the latest wins.
alter table parking.safe_parking_spots add column last_reported_at timestamptz;
update parking.safe_parking_spots set last_reported_at = reported_at;
alter table parking.safe_parking_spots alter column last_reported_at set not null;

grant select, insert, update, delete on parking.spot_reports to wagonwise_app;
