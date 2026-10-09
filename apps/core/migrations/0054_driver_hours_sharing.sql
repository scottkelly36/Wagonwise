-- Driver hours: a driver can share their live status (driving, break, other work, and the driving time left) with a
-- company they drive for, so it shows next to their job on the live map. Everything is off until chosen, at both levels:
-- the firm switches the feature on (hours.settings), and each driver separately chooses per company (hours.sharing).
-- Only the latest status is kept (hours.status); it is replaced on each update and deleted when stale.
create schema if not exists hours;

create table hours.settings (
  company_id uuid primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null,
  updated_by uuid
);

-- A row exists while the driver is sharing with the company; withdrawing deletes it.
create table hours.sharing (
  company_id uuid not null,
  driver_id uuid not null,
  consented_at timestamptz not null,
  wording_version integer not null,
  primary key (company_id, driver_id)
);

create table hours.status (
  company_id uuid not null,
  driver_id uuid not null,
  state text not null check (state in ('driving', 'working', 'on_break')),
  driving_left_min integer not null check (driving_left_min >= 0),
  next text not null check (next in ('break', 'limit')),
  updated_at timestamptz not null,
  primary key (company_id, driver_id)
);
create index status_updated_idx on hours.status (updated_at);

grant usage on schema hours to wagonwise_app;
grant select, insert, update, delete on all tables in schema hours to wagonwise_app;
alter default privileges in schema hours grant select, insert, update, delete on tables to wagonwise_app;

alter table hours.settings enable row level security;
alter table hours.sharing enable row level security;
alter table hours.status enable row level security;

-- A driver may read the firm's switch for a company they are an active member of, so the app can offer sharing only
-- where the firm has turned it on. Only the company's staff (and WagonWise) change it.
create policy company_rows on hours.settings
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
create policy driver_reads_own_companies on hours.settings for select
  using (
    company_id in (
      select company_id from fleet.driver_links
      where driver_id = public.rls_driver_id() and status = 'active'
    )
  );

-- A driver reads and changes only their own rows; the company's staff read theirs (the office needs to see who is sharing).
create policy driver_rows on hours.sharing
  using (driver_id = public.rls_driver_id())
  with check (driver_id = public.rls_driver_id());
create policy company_rows on hours.sharing
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());

create policy driver_rows on hours.status
  using (driver_id = public.rls_driver_id())
  with check (driver_id = public.rls_driver_id());
create policy company_rows on hours.status
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
