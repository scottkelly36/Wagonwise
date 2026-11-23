-- Payment groundwork (docs/company-account-states-scope.md, "Taking payment"): whether a company has payment details on file with a
-- payment provider, the attempts to collect an invoice, and the provider messages already dealt with. WagonWise's own records of plans,
-- vehicle capacity and invoices stay in `billing`; the provider holds the payment method and collects what core says is due. No
-- provider is connected yet, so nothing here is written until one is.

-- A company can now be written to when its account is active again.
alter table companies.account_email_log drop constraint account_email_log_kind_check;
alter table companies.account_email_log
  add constraint account_email_log_kind_check
  check (kind in ('trial_14', 'trial_7', 'overdue', 'overdue_week', 'paused', 'resumed'));

create schema if not exists payments;
grant usage on schema payments to wagonwise_app;
alter default privileges in schema payments grant select, insert, update, delete on tables to wagonwise_app;

-- One row per company that has started to add payment details. `provider_ref` is the provider's own id for the customer, never a card or
-- bank number: those are entered on the provider's page and never reach WagonWise.
create table payments.customers (
  company_id uuid primary key references companies.companies (id),
  provider text not null check (char_length(provider) between 1 and 40),
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
  details_on_file boolean not null default false,
  updated_at timestamptz not null default now()
);

-- An attempt to collect an invoice. At most one open attempt per invoice, so pressing the button twice cannot charge twice.
create table payments.collections (
  id uuid primary key,
  company_id uuid not null references companies.companies (id),
  invoice_id uuid not null,
  amount_pence integer not null check (amount_pence > 0),
  status text not null check (status in ('requested', 'paid', 'failed')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  settled_at timestamptz,
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500)
);
create unique index collections_one_open_per_invoice on payments.collections (invoice_id) where status = 'requested';
create index collections_company_idx on payments.collections (company_id, requested_at desc);

-- Provider messages already dealt with, by the provider's own id, so a message sent twice is acted on once.
create table payments.processed_events (
  event_id text primary key check (char_length(event_id) between 1 and 200),
  kind text not null,
  received_at timestamptz not null default now()
);

alter table payments.customers enable row level security;
-- A company reads its own row (to see whether details are on file); WagonWise staff read and write all. Writes come from the provider's
-- messages and the "add payment details" page, in WagonWise staff's or the company's own scope.
create policy platform_all on payments.customers
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
create policy company_rows on payments.customers
  using (company_id = public.rls_company_id()) with check (company_id = public.rls_company_id());

alter table payments.collections enable row level security;
create policy platform_all on payments.collections
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());

alter table payments.processed_events enable row level security;
create policy platform_all on payments.processed_events
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
