-- Notes from WagonWise to its drivers about what has changed in the app, written by WagonWise staff in the portal. The driver app shows the newest one
-- once, as "What's new". Nothing here belongs to a company, so there is no row-level policy (as for closures): only WagonWise staff can write
-- one (checked in the use case), and every driver may read them.
create schema if not exists announcements;

create table announcements.announcements (
  id uuid primary key,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 600),
  published_at timestamptz not null,
  -- The staff account that wrote it. No foreign key: staff accounts are another context's.
  published_by text not null
);
create index announcements_published_idx on announcements.announcements (published_at desc);

grant usage on schema announcements to wagonwise_app;
grant select, insert, update, delete on all tables in schema announcements to wagonwise_app;
alter default privileges in schema announcements grant select, insert, update, delete on tables to wagonwise_app;
