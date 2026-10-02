-- P2-M2.3: drivers joining companies (docs/history/p2-m2-driver-links.md). Replaces the single
-- identity.drivers.company_id with links: a driver can work for several companies, and gets in
-- either by being invited (by phone or email) or by asking with the company's code, with the
-- company approving. identity.drivers.company_id is left in place here: jobs still read it, and
-- it goes at the cut-over (P2-M2.8).
--
-- To undo (nothing else depends on these yet): drop table fleet.driver_links, fleet.company_codes;
-- drop function fleet.company_for_code, public.rls_driver_id, public.rls_driver_identifier.

create table fleet.driver_links (
  id uuid primary key,
  company_id uuid not null,
  -- Set for a request, and once an invitation is accepted. An invitation is made for an
  -- identifier, not a driver, so the dashboard can't be used to find out who has an account.
  driver_id uuid,
  invited_identifier text,
  status text not null check (status in ('invited', 'requested', 'active', 'declined', 'left')),
  created_at timestamptz not null,
  decided_at timestamptz,
  check (driver_id is not null or invited_identifier is not null)
);

-- One live link per company and driver, and one pending invitation per company and identifier.
-- Declined and left rows stay as history.
create unique index driver_links_live_driver_idx on fleet.driver_links (company_id, driver_id)
  where driver_id is not null and status in ('invited', 'requested', 'active');
create unique index driver_links_pending_invite_idx
  on fleet.driver_links (company_id, invited_identifier) where status = 'invited';
create index driver_links_driver_idx on fleet.driver_links (driver_id);
create index driver_links_identifier_idx on fleet.driver_links (invited_identifier)
  where status = 'invited';

-- Each company's current join code. Stored as typed (not hashed): staff need to read it out to
-- drivers, and it admits nobody by itself, since every request still needs the company's
-- approval. Regenerating replaces the row, so the old code stops working at once.
create table fleet.company_codes (
  company_id uuid primary key,
  code text not null unique,
  created_at timestamptz not null
);

-- Drivers already assigned to a company by an admin keep working: each becomes an active link.
insert into fleet.driver_links (id, company_id, driver_id, status, created_at, decided_at)
select gen_random_uuid(), d.company_id, d.id, 'active', now(), now()
from identity.drivers d
where d.company_id is not null;

-- ---- Row-Level Security (0021 pattern, plus the driver's own scope) -------------------------
-- A driver asks to join, or answers an invitation, before any company is in play, so the driver
-- scope (app.driver_id / app.driver_identifier, set by platform/postgres-data-scopes.ts) sees
-- their own links and the invitations made for their identifier.

create function public.rls_driver_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.driver_id', true), '')::uuid $$;

create function public.rls_driver_identifier() returns text
  language sql stable
  as $$ select nullif(current_setting('app.driver_identifier', true), '') $$;

alter table fleet.driver_links enable row level security;
create policy company_and_driver_rows on fleet.driver_links
  using (
    company_id = public.rls_company_id() or public.rls_platform_staff()
    or driver_id = public.rls_driver_id()
    or (status = 'invited' and invited_identifier = public.rls_driver_identifier())
  )
  with check (
    company_id = public.rls_company_id() or public.rls_platform_staff()
    or driver_id = public.rls_driver_id()
  );

alter table fleet.company_codes enable row level security;
create policy company_rows on fleet.company_codes
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());

-- How a driver turns a typed code into a company without being able to read anyone's codes: this
-- runs as the table owner (which skips RLS) and answers only for the exact code it is given.
create function fleet.company_for_code(p_code text) returns uuid
  language sql stable security definer
  set search_path = fleet, pg_temp
  as $$ select company_id from fleet.company_codes where code = p_code $$;

grant execute on function fleet.company_for_code(text) to wagonwise_app;
