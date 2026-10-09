-- Costing (Phase 3): what a firm tells WagonWise about its own costs, so the cost of a job can be worked out.
--
-- Running costs: a monthly amount that carries on until changed or stopped (finance, insurance, road tax, a service plan...),
-- for one vehicle, or for the firm as a whole (an overhead: the office, software, the yard). Like the standing costs on the
-- Finances page, it is entered once; changing it from a month keeps the earlier months as they were.
create table costing.running_costs (
  id uuid primary key,
  company_id uuid not null,
  -- Null for an overhead belonging to the firm rather than to a vehicle.
  vehicle_id uuid,
  description text not null check (char_length(description) between 1 and 80),
  monthly_pence bigint not null check (monthly_pence between 0 and 100000000),
  from_month text not null check (from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  to_month text check (to_month is null or to_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz not null,
  created_by uuid,
  check (to_month is null or to_month >= from_month)
);
create index running_costs_company_idx on costing.running_costs (company_id);

-- What a driver costs an hour. A rate applies from a day and until the next one starts, so a pay rise does not change the
-- cost of work already done.
create table costing.driver_rates (
  id uuid primary key,
  company_id uuid not null,
  driver_id uuid not null,
  hourly_pence integer not null check (hourly_pence between 1 and 50000),
  from_day date not null,
  created_at timestamptz not null,
  created_by uuid,
  unique (company_id, driver_id, from_day)
);
create index driver_rates_company_idx on costing.driver_rates (company_id);

alter table costing.running_costs enable row level security;
alter table costing.driver_rates enable row level security;
create policy company_rows on costing.running_costs
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
create policy company_rows on costing.driver_rates
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
