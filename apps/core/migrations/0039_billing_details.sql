-- WagonWise's own billing details, printed on the invoices it sends companies (Phase 3, item 0).
-- One row, edited by WagonWise admins in the dashboard. Until the owner has a trading name and bank
-- account, every field holds a [bracketed] placeholder, and issuing an invoice is refused while any
-- bracket remains (billing/domain/billing-details.ts), so a placeholder cannot reach a customer.
create schema if not exists billing;

create table billing.details (
  -- A single row: the primary key can only ever be true.
  id boolean primary key default true check (id),
  trading_name text not null check (char_length(trading_name) between 1 and 120),
  address text not null check (char_length(address) between 1 and 400),
  contact_email text not null check (char_length(contact_email) between 1 and 200),
  payment_details text not null check (char_length(payment_details) between 1 and 400),
  vat_status text not null check (char_length(vat_status) between 1 and 200),
  payment_terms text not null check (char_length(payment_terms) between 1 and 200),
  updated_at timestamptz not null default now(),
  -- The WagonWise admin who last changed it; null for the seeded placeholders.
  updated_by uuid
);

insert into billing.details (trading_name, address, contact_email, payment_details, vat_status, payment_terms)
values (
  '[Trading name]',
  '[Address]',
  '[Billing email]',
  '[Bank details]',
  '[VAT number, or "Not VAT registered"]',
  '[Payment terms]'
);

-- billing did not exist when 0021 ran, so it needs its own grants (as places did).
grant usage on schema billing to wagonwise_app;
grant select, insert, update, delete on all tables in schema billing to wagonwise_app;
alter default privileges in schema billing grant select, insert, update, delete on tables to wagonwise_app;

-- WagonWise's own data, not a company's: only the platform scope sees it.
alter table billing.details enable row level security;
create policy platform_only on billing.details
  using (public.rls_platform_staff())
  with check (public.rls_platform_staff());
