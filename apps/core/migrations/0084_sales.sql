-- WagonWise's own sales notebook: the haulage firms the owner is approaching and a log of each contact. Business contact
-- details only, kept by WagonWise for itself. Only WagonWise staff can read or write these tables (no company owns them), the
-- same as signups.testers.
create schema if not exists sales;

create table sales.prospects (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 120),
  town text check (town is null or char_length(town) <= 80),
  -- About how many lorries.
  fleet_size integer check (fleet_size is null or fleet_size between 0 and 10000),
  haulage_type text check (haulage_type is null or char_length(haulage_type) <= 200),
  website text check (website is null or char_length(website) <= 200),
  phone text check (phone is null or char_length(phone) <= 60),
  email text check (email is null or char_length(email) <= 254),
  contact_person text check (contact_person is null or char_length(contact_person) <= 80),
  -- Decides how the firm may be contacted: a limited company's mailbox, or by phone only.
  legal_form text not null default 'unknown'
    check (legal_form in ('limited', 'sole_trader_or_partnership', 'unknown')),
  -- warm: someone the owner already knows. new: a cold contact.
  relationship text not null default 'new' check (relationship in ('warm', 'new')),
  stage text not null default 'not_contacted' check (stage in (
    'not_contacted', 'contacted', 'replied', 'conversation', 'demo', 'pilot', 'paying',
    'not_interested', 'do_not_contact'
  )),
  next_step text check (next_step is null or char_length(next_step) <= 300),
  next_step_on date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null
);
-- One row per firm name, whatever the case, so an import run twice adds nothing the second time.
create unique index prospects_name_idx on sales.prospects (lower(name));

create table sales.entries (
  id uuid primary key,
  prospect_id uuid not null references sales.prospects (id) on delete cascade,
  at timestamptz not null,
  how text not null check (how in ('phone', 'email', 'facebook', 'in_person', 'other')),
  result text not null check (result in (
    'sent', 'replied', 'conversation', 'demo', 'pilot', 'not_interested', 'opted_out'
  )),
  -- The one problem the message or call led with.
  pitch text check (pitch is null or pitch in (
    'checks', 'maintenance', 'proof_of_delivery', 'fuel_costs', 'jobs', 'routes_parking', 'other'
  )),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null
);
create index entries_prospect_idx on sales.entries (prospect_id, at);

grant usage on schema sales to wagonwise_app;
grant select, insert, update, delete on all tables in schema sales to wagonwise_app;
alter default privileges in schema sales grant select, insert, update, delete on tables to wagonwise_app;

alter table sales.prospects enable row level security;
create policy platform_rows on sales.prospects
  using (public.rls_platform_staff())
  with check (public.rls_platform_staff());

alter table sales.entries enable row level security;
create policy platform_rows on sales.entries
  using (public.rls_platform_staff())
  with check (public.rls_platform_staff());
