-- The monthly run that drafts last month's invoices on its own (from the 2nd of each month): one row per month it has been done, so it is done
-- once. Without this, a draft the owner deliberately deleted (a test firm, a mistake) would be drafted again the next day.
--
-- The month before the one this runs in is recorded as already done: the owner has been drafting by hand, and the first automatic run
-- should be the next one, not a surprise batch of drafts the day this ships.
--
-- To undo: drop table billing.draft_runs;

create table billing.draft_runs (
  month text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ran_at timestamptz not null,
  drafts integer not null check (drafts >= 0),
  total_pence bigint not null
);

grant select, insert, update, delete on all tables in schema billing to wagonwise_app;

-- WagonWise's own books: only the platform scope sees any of it, never a company.
alter table billing.draft_runs enable row level security;
create policy platform_only on billing.draft_runs
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());

insert into billing.draft_runs (month, ran_at, drafts, total_pence)
values (to_char((now() at time zone 'Europe/London') - interval '1 month', 'YYYY-MM'), now(), 0, 0);
