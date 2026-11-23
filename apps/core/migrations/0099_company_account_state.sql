-- Whether a company may use WagonWise (docs/company-account-states-scope.md). A company is on a free trial, paying (or free by the
-- owner's say-so), overdue (in the grace period) or paused: a paused company can still sign in and read its pages, but cannot change
-- anything, and its drivers lose that company's jobs (not the free app). Nothing is deleted by a pause.
--
-- Every company that exists now is 'active', so nothing changes for the pilot firm. A company made after this starts on a trial.

alter table companies.companies
  add column account_status text not null default 'active'
    check (account_status in ('trial', 'active', 'overdue', 'paused')),
  -- The UK day the free period ends; only meaningful while on a trial.
  add column trial_ends_on date,
  add column overdue_since timestamptz,
  add column paused_at timestamptz,
  -- Why it is in this state, in the owner's words ("waiting for payment details"). Shown to the owner only.
  add column status_note text not null default '' check (char_length(status_note) <= 500),
  -- The owner's "never pause this company": the automatic rules (a later change) skip it.
  add column status_hold boolean not null default false;

-- Settings for every company's account state, one row: how long a new company's free period is (3 months now, 1 later) and how
-- long it is overdue before it is paused.
create table companies.account_settings (
  only_row boolean primary key default true check (only_row),
  default_trial_days integer not null default 90 check (default_trial_days between 1 and 365),
  grace_days integer not null default 14 check (grace_days between 0 and 90),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into companies.account_settings (only_row) values (true);

-- Every move from one state to another, by whom (null: the system) and why.
create table companies.account_state_log (
  id uuid primary key,
  company_id uuid not null references companies.companies (id),
  from_status text,
  to_status text not null check (to_status in ('trial', 'active', 'overdue', 'paused')),
  by_staff_id uuid,
  note text not null default '' check (char_length(note) <= 500),
  at timestamptz not null default now()
);
create index account_state_log_company_idx on companies.account_state_log (company_id, at desc);

-- The settings are not private (two numbers) and a company is created outside a data scope, so they have no policy, like
-- companies.companies. The log is WagonWise staff only: a company never reads how it was moved.
alter table companies.account_state_log enable row level security;
create policy platform_all on companies.account_state_log
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
