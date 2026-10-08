-- What each company pays for (Phase 3 item 0). WagonWise bills the vehicle capacity a company commits to,
-- not the vehicles it happens to use: capacity times a price per vehicle. A WagonWise admin sets both.
--
-- Capacity is effective-dated: "5 vehicles from 1 November, 8 from 1 December" is two rows, so changing
-- it later never alters what a past month was billed. The capacity in force is the latest row whose
-- date has arrived. A company with no row has capacity 0 and cannot add vehicles until an admin sets one.
-- Fleet enforces it when a vehicle is created (fleet/application/create-fleet-vehicle.ts).

create table billing.plans (
  company_id uuid primary key,
  -- Pence, so money is never a float. £10.00 is 1000.
  price_per_vehicle_pence integer not null default 1000
    check (price_per_vehicle_pence between 0 and 1000000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table billing.capacity_changes (
  id uuid primary key,
  company_id uuid not null,
  effective_from date not null,
  capacity integer not null check (capacity between 0 and 10000),
  created_at timestamptz not null default now(),
  -- The WagonWise admin who set it; null for the rows backfilled below.
  created_by uuid,
  -- One capacity per company per day: setting it again for the same day replaces it.
  unique (company_id, effective_from)
);

-- Existing companies keep working: capacity starts at the vehicles they have now (at least 1), from today,
-- at the default price. An admin then sets the real figure.
insert into billing.plans (company_id)
  select id from companies.companies;
insert into billing.capacity_changes (id, company_id, effective_from, capacity)
  select gen_random_uuid(), c.id, current_date,
         greatest(1, (select count(*) from fleet.vehicles v where v.company_id = c.id))
  from companies.companies c;

grant select, insert, update, delete on all tables in schema billing to wagonwise_app;

-- WagonWise admins see and change everything. A company's staff may read their own plan (so the portal can
-- say "5 of 5 vehicles used" and fleet can enforce it), never change it.
alter table billing.plans enable row level security;
create policy platform_all on billing.plans
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
create policy company_read_own on billing.plans for select
  using (company_id = public.rls_company_id());

alter table billing.capacity_changes enable row level security;
create policy platform_all on billing.capacity_changes
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
create policy company_read_own on billing.capacity_changes for select
  using (company_id = public.rls_company_id());
