-- Invoices WagonWise sends companies (Phase 3 item 0). One per company per month, generated as a draft from
-- the company's plan (capacity times price, pro rata for a mid-month rise), reviewed by an admin, then issued.
--
-- A draft has no number and can change. Issuing gives it the next number, stamps WagonWise's billing details as
-- they were that day (so a later change of name or bank never alters a sent invoice) and freezes it. A void
-- invoice keeps its number, so numbers have no gaps, and frees the month to be invoiced again.
-- Money is whole pence, never a float.

create table billing.invoices (
  id uuid primary key,
  company_id uuid not null,
  -- The company's name when the draft was made; an issued invoice must not change if the company is renamed.
  company_name text not null,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null check (status in ('draft', 'issued', 'paid', 'void')),
  number text unique,
  seq integer unique,
  created_at timestamptz not null,
  created_by uuid,
  issued_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  issued_details jsonb,
  -- A number, a date and the stamped details all arrive together at issue, and never before.
  check ((status = 'draft') = (number is null)),
  check ((status = 'draft') = (issued_at is null)),
  check ((status = 'draft') = (issued_details is null))
);

-- One live invoice per company per month; a void one does not count.
create unique index invoices_one_live_per_month_idx
  on billing.invoices (company_id, month) where status <> 'void';
create index invoices_company_idx on billing.invoices (company_id);

create table billing.invoice_lines (
  id uuid primary key,
  invoice_id uuid not null references billing.invoices (id) on delete cascade,
  position integer not null,
  description text not null check (char_length(description) between 1 and 200),
  quantity integer not null,
  unit_pence integer not null,
  amount_pence integer not null,
  unique (invoice_id, position)
);

-- The last number given out. Updated in the same transaction as the invoice it numbers, so a failed issue
-- leaves no gap.
create table billing.invoice_counter (
  id boolean primary key default true check (id),
  last_seq integer not null default 0
);
insert into billing.invoice_counter default values;

grant select, insert, update, delete on all tables in schema billing to wagonwise_app;

-- WagonWise's own records for now. A company will be allowed to read its issued invoices when the portal
-- shows them (a later migration); until then only WagonWise staff see any of it.
alter table billing.invoices enable row level security;
create policy platform_only on billing.invoices
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
alter table billing.invoice_lines enable row level security;
create policy platform_only on billing.invoice_lines
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
alter table billing.invoice_counter enable row level security;
create policy platform_only on billing.invoice_counter
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
