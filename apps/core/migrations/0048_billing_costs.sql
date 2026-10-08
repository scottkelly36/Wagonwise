-- WagonWise's own running costs, entered by an admin so the Finances page can set them against what the companies
-- are invoiced (Phase 3 M1 and M6, as the owner reframed them on 2026-10-09).
--
-- A cost is standing: it applies from `from_month` and carries on every month until it is changed or stopped, so most
-- need entering once. Changing the amount from a later month closes this row the month before and starts another
-- (done in the application), which keeps earlier months exactly as they were: a past month's profit never moves.
-- A one-off cost is a row whose last month is its first. Months are `YYYY-MM`; amounts are whole pence, ex VAT.
create table billing.costs (
  id uuid primary key,
  category text not null check (category in ('hosting', 'maps', 'messaging', 'software', 'wages', 'other')),
  description text not null check (char_length(description) between 1 and 120),
  amount_pence integer not null check (amount_pence between 0 and 100000000),
  from_month text not null check (from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- The last month it applies to; null means it carries on.
  to_month text check (to_month is null or (to_month ~ '^\d{4}-(0[1-9]|1[0-2])$' and to_month >= from_month)),
  created_at timestamptz not null,
  created_by uuid
);

grant select, insert, update, delete on all tables in schema billing to wagonwise_app;

-- WagonWise's own books: only the platform scope sees any of it, never a company.
alter table billing.costs enable row level security;
create policy platform_only on billing.costs
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
