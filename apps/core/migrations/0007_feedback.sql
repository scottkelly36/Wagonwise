-- M5.9: feedback.notes (design doc §3/§9). Insert-only — a FeedbackNote is never edited or
-- deleted once sent (same reasoning as routing.route_plans, decision 10): a point-in-time
-- message to the developer, not a record anything revises afterwards. No read endpoint exists
-- either (the module's own scope: a one-way channel to the developer, read via psql/a future
-- admin tool, not the app itself).

create table feedback.notes (
  id uuid primary key,
  driver_id uuid not null,
  message text not null,
  app_version text not null,
  device_info text not null,
  created_at timestamptz not null default now()
);
