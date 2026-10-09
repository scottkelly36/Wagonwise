-- People who register their email on the landing page to test WagonWise. Not accounts: just an address to invite later.
-- Only WagonWise staff can read this table (no company owns it); the public sign-up goes through the module, which runs in the
-- platform scope for that one insert, after checking the request.
create schema if not exists signups;

create table signups.testers (
  id uuid primary key,
  -- Lower case and trimmed, so the same address twice is the same person.
  email text not null unique check (char_length(email) between 3 and 254),
  name text check (name is null or char_length(name) <= 80),
  role text not null check (role in ('driver', 'company', 'both', 'other')),
  company text check (company is null or char_length(company) <= 120),
  fleet_size text check (fleet_size is null or fleet_size in ('1-5', '6-15', '16-40', '40+')),
  -- When they ticked the box agreeing to be contacted, which is why they are here.
  consented_at timestamptz not null,
  created_at timestamptz not null
);
create index testers_created_idx on signups.testers (created_at);

grant usage on schema signups to wagonwise_app;
grant select, insert, update, delete on all tables in schema signups to wagonwise_app;
alter default privileges in schema signups grant select, insert, update, delete on tables to wagonwise_app;

alter table signups.testers enable row level security;
create policy platform_rows on signups.testers
  using (public.rls_platform_staff())
  with check (public.rls_platform_staff());
