-- M5.6: routing.active_trips (design doc §3). `endTrip` mutates a row in place (endedAt), unlike
-- the insert-only route_plans table (decision 10 is about RoutePlan, not ActiveTrip).
--
-- last_position_lat/lon stay null for the whole of M5.6 (docs/progress.md) — no position-update
-- endpoint exists yet; only M6's reroute alerts need one, so it isn't built until it has a real
-- caller.
--
-- The application layer already checks "does this driver have an active trip" before starting one
-- (start-trip.ts), but that check-then-insert has a race under two concurrent start requests — the
-- same kind of gap M1.5's invite-code redemption race left open as a plain thrown exception
-- (docs/progress.md, M1.5 deviations). A partial unique index closes it for real here, since it's
-- nearly free: a second concurrent insert violates the constraint and 500s rather than silently
-- creating two active trips for one driver.

create table routing.active_trips (
  id uuid primary key,
  route_plan_id uuid not null,
  driver_id uuid not null,
  started_at timestamptz not null default now(),
  last_position_lat double precision,
  last_position_lon double precision,
  ended_at timestamptz
);

create unique index active_trips_one_per_driver_idx
  on routing.active_trips (driver_id)
  where ended_at is null;
