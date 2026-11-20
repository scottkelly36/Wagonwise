-- Drivers recommending WagonWise to the firm they drive for (docs/modules.md, "Referrals"). A code per driver; a referral when a firm
-- joins and names one; a gift card once the firm has paid its first bill. Nothing here belongs to a company, so there is no row-level
-- policy: drivers reach only their own rows through the use cases, and only WagonWise staff see the list (checked in the use case).
create schema if not exists referrals;

create table referrals.codes (
  driver_id uuid primary key,
  code text not null unique check (code ~ '^WW-[A-HJKMNP-Z2-9]{6}$'),
  created_at timestamptz not null
);

create table referrals.referrals (
  id uuid primary key,
  code text not null,
  driver_id uuid not null,
  firm_name text not null check (char_length(firm_name) between 1 and 120),
  -- The firm's name without case, spaces or "Ltd", so one firm cannot earn two rewards.
  firm_key text not null,
  status text not null check (status in ('signed_up', 'reward_due', 'claimed', 'sent', 'void')),
  -- Given by the driver only to claim a reward that is due, and used for that alone.
  reward_email text check (reward_email is null or char_length(reward_email) <= 200),
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create unique index referrals_one_per_firm on referrals.referrals (firm_key) where status <> 'void';
create index referrals_driver_idx on referrals.referrals (driver_id);

grant usage on schema referrals to wagonwise_app;
grant select, insert, update, delete on all tables in schema referrals to wagonwise_app;
alter default privileges in schema referrals grant select, insert, update, delete on tables to wagonwise_app;
