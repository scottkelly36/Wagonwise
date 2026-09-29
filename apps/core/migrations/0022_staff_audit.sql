-- P2-M1.11: the staff audit log (docs/history/p2-m1-organisations-auth.md). One row per
-- security-relevant staff event: sign-ins, joining, invites, privilege changes, removals.
-- Written by core in the same transaction as the change it describes.

create table companies.staff_audit (
  id uuid primary key,
  at timestamptz not null,
  action text not null check (action in (
    'invite_created', 'staff_joined', 'signed_in', 'sign_in_failed', 'second_factor_failed',
    'privileges_changed', 'staff_removed'
  )),
  -- No foreign keys to staff_accounts on purpose: the log must outlive any account it mentions,
  -- and a removed account keeps its row anyway (soft delete).
  actor_id uuid,
  -- Null for WagonWise staff accounts, which belong to no company: only WagonWise admins see
  -- those entries.
  company_id uuid,
  target_id uuid,
  details jsonb not null default '{}'::jsonb
);

create index staff_audit_company_at_idx on companies.staff_audit (company_id, at desc);
create index staff_audit_at_idx on companies.staff_audit (at desc);

-- Append-only for the app: 0021's default privileges gave wagonwise_app update and delete on new
-- tables; an audit log keeps neither. Inserting and reading stay.
revoke update, delete, truncate on companies.staff_audit from wagonwise_app;

-- Same visibility as the staff tables (0021): a company's own rows, everything for WagonWise
-- admins, and the sign-in scope (which records failed and successful sign-ins).
alter table companies.staff_audit enable row level security;
create policy company_rows on companies.staff_audit
  using (company_id = public.rls_company_id() or public.rls_platform_staff()
         or public.rls_staff_auth())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff()
              or public.rls_staff_auth());
