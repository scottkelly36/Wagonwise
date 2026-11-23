-- The emails sent to a company about its account (docs/company-account-states-scope.md): the free period ending, payment overdue, the
-- account paused. One row per email kind and per occasion (`period_key`: the day the trial ends, or the day it went overdue or was
-- paused), written BEFORE the email goes out, so the same email is never sent twice for the same occasion, by hand or by the
-- automatic task that comes later. A failed send gives the row back, so the next pass tries again.

create table companies.account_email_log (
  company_id uuid not null references companies.companies (id),
  kind text not null check (kind in ('trial_14', 'trial_7', 'overdue', 'overdue_week', 'paused')),
  period_key text not null,
  sent_at timestamptz not null default now(),
  -- How many people it went to, filled in once it has gone.
  recipients integer not null default 0,
  primary key (company_id, kind, period_key)
);

-- WagonWise staff only: a company never reads how it was chased.
alter table companies.account_email_log enable row level security;
create policy platform_all on companies.account_email_log
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
