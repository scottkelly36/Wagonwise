-- Stage 2 of "What's new": a note can also be sent as a notification. Record when it was sent and to how many phones (so a second one is not sent within a few
-- days, and the portal can say what happened), and keep each driver's choice to switch these notifications off. A driver is on unless they have a row here.
alter table announcements.announcements
  add column pushed_at timestamptz,
  add column pushed_to integer check (pushed_to is null or pushed_to >= 0);

create table announcements.push_opt_outs (
  -- The driver who turned notifications from WagonWise off. No foreign key: drivers are another context's, and the row goes when the account is deleted.
  driver_id uuid primary key,
  opted_out_at timestamptz not null
);
