-- Costing (Phase 3 M3): fuel. A firm imports its fuel card statement (a CSV it maps column by column), and each purchase is
-- matched to one of its vehicles by registration. Re-importing the same statement adds nothing twice (the dedupe key), and a
-- wrong file can be undone as a whole (deleting an import deletes its purchases).
create schema if not exists costing;

create table costing.fuel_imports (
  id uuid primary key,
  company_id uuid not null,
  file_name text not null,
  imported_at timestamptz not null,
  imported_by uuid,
  rows_total integer not null,
  rows_imported integer not null,
  rows_duplicate integer not null
);

create table costing.fuel_transactions (
  id uuid primary key,
  company_id uuid not null,
  import_id uuid not null references costing.fuel_imports (id) on delete cascade,
  occurred_at timestamptz not null,
  -- As the statement wrote it, tidied (capitals, no spaces). The vehicle is found from it, and found again later if the
  -- registration is added to a vehicle afterwards.
  registration text not null,
  vehicle_id uuid,
  litres numeric(9, 2) check (litres is null or litres >= 0),
  -- Whole pence, as the statement gives it (a credit is negative). The firm uses the same basis (with or without VAT) as
  -- the rest of its costs.
  amount_pence bigint not null,
  description text,
  dedupe_key text not null,
  unique (company_id, dedupe_key)
);

create index fuel_transactions_company_time_idx on costing.fuel_transactions (company_id, occurred_at);
create index fuel_transactions_company_vehicle_idx on costing.fuel_transactions (company_id, vehicle_id);

grant usage on schema costing to wagonwise_app;
grant select, insert, update, delete on all tables in schema costing to wagonwise_app;
alter default privileges in schema costing grant select, insert, update, delete on tables to wagonwise_app;

alter table costing.fuel_imports enable row level security;
alter table costing.fuel_transactions enable row level security;
create policy company_rows on costing.fuel_imports
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
create policy company_rows on costing.fuel_transactions
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
