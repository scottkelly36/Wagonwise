-- M1.4: the four bounded-context schemas plus the outbox (AGENTS.md, decision 14).
-- Raw SQL on purpose (decision 12) — PostGIS geography columns and GiST indexes read clearer
-- written directly than expressed through a migration generator. Table DDL for each context
-- (identity.drivers, routing.vehicle_profiles, ...) lands with the milestone that needs it,
-- not here; this migration only stands up the schemas and the outbox, which nothing else can
-- start work without.

create extension if not exists postgis;

create schema if not exists identity;
create schema if not exists routing;
create schema if not exists hazards;
create schema if not exists feedback;
create schema if not exists outbox;

-- Domain events, written in the same transaction as the aggregate that raised them (decision 4).
create table outbox.events (
  event_id uuid primary key,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0
);

-- Polled in creation order, oldest first (decision 5).
create index events_pending_idx on outbox.events (created_at) where processed_at is null;

-- The idempotency guard: at-least-once delivery means a handler may see the same event twice,
-- and a row here (not an exception it has to catch) is what makes the second delivery a no-op.
create table outbox.handled (
  event_id uuid not null references outbox.events (event_id),
  handler_name text not null,
  handled_at timestamptz not null default now(),
  primary key (event_id, handler_name)
);
