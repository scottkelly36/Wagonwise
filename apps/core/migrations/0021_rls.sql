-- P2-M1.7: Row-Level Security on company-owned data (docs/history/p2-m1-organisations-auth.md).
--
-- Postgres skips RLS for superusers and table owners, and until now core connected as the owner.
-- So this adds `wagonwise_app`: a role with plain read/write grants that owns nothing. Migrations
-- keep running as the owner (DATABASE_URL); core runs as wagonwise_app once APP_DATABASE_URL is
-- set. Until then these policies exist but the owner isn't subject to them, so nothing changes.
--
-- The role is created without a password (NOLOGIN) if it doesn't exist; the deployment guide
-- says how to give it one. If it was already created by hand (e.g. from DigitalOcean's control
-- panel), it's left as it is and only granted access here.
do $$
begin
  if not exists (select from pg_roles where rolname = 'wagonwise_app') then
    create role wagonwise_app nologin;
  end if;
end
$$;

-- Everything core reads and writes, and the same for tables later migrations add (default
-- privileges apply to tables this role, the migration owner, creates from now on).
do $$
declare
  s text;
begin
  foreach s in array array['identity', 'routing', 'hazards', 'feedback', 'outbox', 'congestion',
                           'companies', 'parking', 'fleet']
  loop
    execute format('grant usage on schema %I to wagonwise_app', s);
    execute format('grant select, insert, update, delete on all tables in schema %I to wagonwise_app', s);
    execute format('grant usage, select on all sequences in schema %I to wagonwise_app', s);
    execute format('alter default privileges in schema %I grant select, insert, update, delete on tables to wagonwise_app', s);
    execute format('alter default privileges in schema %I grant usage, select on sequences to wagonwise_app', s);
  end loop;
end
$$;

-- PostGIS functions: nothing to grant. Functions are executable by everyone by default, and
-- PostGIS's install already grants select on public.spatial_ref_sys to everyone.

-- The three settings core sets per transaction (platform/postgres-data-scopes.ts). Unset or
-- empty means "no": outside a scope, every table below shows and accepts no rows at all.
create function public.rls_company_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.company_id', true), '')::uuid $$;

create function public.rls_platform_staff() returns boolean
  language sql stable
  as $$ select coalesce(current_setting('app.platform_staff', true), '') = 'on' $$;

create function public.rls_staff_auth() returns boolean
  language sql stable
  as $$ select coalesce(current_setting('app.staff_auth', true), '') = 'on' $$;

-- ---- Company data ------------------------------------------------------------------------

alter table fleet.vehicles enable row level security;
create policy company_rows on fleet.vehicles
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());

-- ---- Staff tables ------------------------------------------------------------------------
-- As above, plus the sign-in scope, which has to find an account before its company is known.
-- A platform account or invite (company_id null) is visible only to platform staff and sign-in.

alter table companies.staff_accounts enable row level security;
create policy company_rows on companies.staff_accounts
  using (company_id = public.rls_company_id() or public.rls_platform_staff()
         or public.rls_staff_auth())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff()
              or public.rls_staff_auth());

alter table companies.staff_invites enable row level security;
create policy company_rows on companies.staff_invites
  using (company_id = public.rls_company_id() or public.rls_platform_staff()
         or public.rls_staff_auth())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff()
              or public.rls_staff_auth());

-- These have no company_id of their own: a row is visible when its account (or, for an
-- enrolment, its invite) is. The subqueries are themselves filtered by the policies above.
alter table companies.staff_sessions enable row level security;
create policy via_account on companies.staff_sessions
  using (exists (select 1 from companies.staff_accounts a where a.id = staff_id))
  with check (exists (select 1 from companies.staff_accounts a where a.id = staff_id));

alter table companies.staff_recovery_codes enable row level security;
create policy via_account on companies.staff_recovery_codes
  using (exists (select 1 from companies.staff_accounts a where a.id = staff_id))
  with check (exists (select 1 from companies.staff_accounts a where a.id = staff_id));

alter table companies.staff_challenges enable row level security;
create policy via_owner on companies.staff_challenges
  using (exists (select 1 from companies.staff_accounts a where a.id = staff_id)
         or exists (select 1 from companies.staff_invites i where i.id = invite_id))
  with check (exists (select 1 from companies.staff_accounts a where a.id = staff_id)
              or exists (select 1 from companies.staff_invites i where i.id = invite_id));
