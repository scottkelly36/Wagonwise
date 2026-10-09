-- Fleet maintenance (Phase 3 M4): each firm keeps its own list of things that fall due on its vehicles (MOT, safety
-- inspections, service, tachograph calibration...), and when each is next due on each vehicle.

-- A new privilege, `manage_maintenance`, so a manager can give "books the vehicles in" to whoever does it. Managers keep
-- it: every fleet account that can manage users or vehicles gets it now, pending invitations included, so nobody who
-- could look after the fleet loses the ability. (Privileges are a jsonb list; there is no database constraint on it.)
update companies.staff_accounts
  set privileges = privileges || '["manage_maintenance"]'::jsonb
  where kind = 'fleet'
    and (privileges ? 'manage_fleet' or privileges ? 'manage_users')
    and not (privileges ? 'manage_maintenance');
update companies.staff_invites
  set privileges = privileges || '["manage_maintenance"]'::jsonb
  where kind = 'fleet'
    and (privileges ? 'manage_fleet' or privileges ? 'manage_users')
    and not (privileges ? 'manage_maintenance');

create schema if not exists maintenance;

-- What a firm tracks. Archived, never deleted, so what was recorded against it keeps its meaning.
create table maintenance.item_types (
  id uuid primary key,
  company_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  interval_value integer not null check (interval_value between 1 and 1200),
  interval_unit text not null check (interval_unit in ('days', 'weeks', 'months')),
  -- From this many days before it is due, it shows as due soon.
  warn_days integer not null check (warn_days between 0 and 365),
  applies_to text not null check (applies_to in ('all', 'selected')),
  vehicle_ids jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index item_types_company_idx on maintenance.item_types (company_id);

-- When each item is next due on each vehicle, and when it was last done. One row per vehicle and item.
create table maintenance.schedules (
  vehicle_id uuid not null,
  item_type_id uuid not null references maintenance.item_types (id),
  company_id uuid not null,
  due_date date not null,
  last_done date,
  updated_at timestamptz not null,
  updated_by uuid,
  primary key (vehicle_id, item_type_id)
);
create index schedules_company_due_idx on maintenance.schedules (company_id, due_date);

-- Every time an item was done, as it was said then.
create table maintenance.history (
  id uuid primary key,
  vehicle_id uuid not null,
  item_type_id uuid not null references maintenance.item_types (id),
  company_id uuid not null,
  item_name text not null,
  done_on date not null,
  next_due date not null,
  note text check (note is null or char_length(note) <= 500),
  done_by uuid,
  recorded_at timestamptz not null
);
create index history_vehicle_idx on maintenance.history (vehicle_id, done_on desc);

grant usage on schema maintenance to wagonwise_app;
grant select, insert, update, delete on all tables in schema maintenance to wagonwise_app;
alter default privileges in schema maintenance grant select, insert, update, delete on tables to wagonwise_app;

-- A company's staff and WagonWise admins see and change a company's rows; nothing else does.
alter table maintenance.item_types enable row level security;
create policy company_rows on maintenance.item_types
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
alter table maintenance.schedules enable row level security;
create policy company_rows on maintenance.schedules
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
alter table maintenance.history enable row level security;
create policy company_rows on maintenance.history
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
