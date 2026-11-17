-- Which steps drivers reach and which fixed choices they make (docs/flow-tracking-plan.md). Anonymous by design: a random session id
-- made in memory when the app opens, and no driver, account or device id, so nothing here can be tied to a person. The event and
-- choice are checked against fixed lists before they get here (packages/contracts usage.ts). Kept 90 days at most: an hourly task
-- deletes older rows. No row-level policy: nothing belongs to a company; written by core for any signed-in driver, read only for
-- WagonWise staff on the usage page.
create schema if not exists usage;

create table usage.flow_events (
  id uuid primary key,
  session_id uuid not null,
  event text not null check (char_length(event) between 1 and 40),
  choice text check (choice is null or char_length(choice) between 1 and 40),
  app_version text not null check (char_length(app_version) between 1 and 20),
  platform text not null check (platform in ('ios', 'android')),
  at timestamptz not null
);
create index flow_events_at_idx on usage.flow_events (at);

grant usage on schema usage to wagonwise_app;
grant select, insert, delete on all tables in schema usage to wagonwise_app;
alter default privileges in schema usage grant select, insert, delete on tables to wagonwise_app;
