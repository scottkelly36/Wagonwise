-- When a trip's "still running?" reminder was sent (routing/application/remind-open-trips.ts), so each trip gets at most one.
alter table routing.active_trips add column reminded_at timestamptz;
