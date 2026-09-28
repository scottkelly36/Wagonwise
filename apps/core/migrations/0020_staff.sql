-- P2-M1.3: dashboard staff accounts (docs/history/p2-m1-organisations-auth.md). Separate from
-- identity.drivers: a staff member signs in with email + password + a second factor, and what
-- they can do is a fixed list of privileges (platform staff: everything, everywhere).
--
-- Row-Level Security on the company-owned tables below comes in P2-M1.7, with a non-owner app
-- role; every company-owned table already carries company_id for it.

create table companies.staff_accounts (
  id uuid primary key,
  kind text not null check (kind in ('platform', 'fleet')),
  company_id uuid references companies.companies (id),
  email text not null,
  name text not null,
  -- The six privileges, as a jsonb array of strings (same reasoning as identity.drivers.scopes,
  -- 0018): a short fixed list with no need for array operators.
  privileges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  -- Soft delete: a removed account keeps its row for the audit trail (P2-M1.11) but can't sign in,
  -- and its email is free to be invited again.
  removed_at timestamptz,
  -- Credentials. Never leave core: the account DTO has none of these.
  password_hash text not null,
  second_factor_method text not null check (second_factor_method in ('totp', 'sms', 'email')),
  -- totp: the shared secret, encrypted by core before it gets here (never stored in the clear).
  totp_secret_ciphertext text,
  -- sms: the UK mobile codes are texted to. email codes go to `email`.
  phone text,
  constraint fleet_users_have_a_company check ((kind = 'fleet') = (company_id is not null)),
  constraint platform_staff_have_no_privileges check (kind = 'fleet' or privileges = '[]'::jsonb),
  constraint second_factor_details check (
    (second_factor_method = 'totp') = (totp_secret_ciphertext is not null)
    and (second_factor_method = 'sms') = (phone is not null)
  )
);

-- One live account per email address (case-insensitive); removed accounts don't block a re-invite.
create unique index staff_accounts_email_live_idx
  on companies.staff_accounts (lower(email)) where removed_at is null;
create index staff_accounts_company_id_idx on companies.staff_accounts (company_id);

create table companies.staff_invites (
  id uuid primary key,
  kind text not null check (kind in ('platform', 'fleet')),
  company_id uuid references companies.companies (id),
  email text not null,
  name text not null,
  privileges jsonb not null default '[]'::jsonb,
  -- sha256 of the emailed token; the token itself is never stored.
  token_hash text not null unique,
  invited_by uuid not null references companies.staff_accounts (id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  constraint fleet_invites_have_a_company check ((kind = 'fleet') = (company_id is not null)),
  constraint platform_invites_have_no_privileges check (kind = 'fleet' or privileges = '[]'::jsonb)
);

create index staff_invites_company_id_idx on companies.staff_invites (company_id);

-- Same shape and rotation/reuse rules as identity.sessions, for staff.
create table companies.staff_sessions (
  id uuid primary key,
  staff_id uuid not null references companies.staff_accounts (id),
  refresh_token_hash text not null,
  previous_refresh_token_hash text,
  issued_at timestamptz not null,
  last_used_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz
);

create index staff_sessions_refresh_token_hash_idx
  on companies.staff_sessions (refresh_token_hash);
create index staff_sessions_previous_refresh_token_hash_idx
  on companies.staff_sessions (previous_refresh_token_hash);
create index staff_sessions_staff_id_idx on companies.staff_sessions (staff_id);

-- A pending second-factor check. `sign-in`: the password was right, the code is still owed.
-- `enrolment`: someone accepting an invite has chosen a password and a second factor, and must
-- prove the factor works before their account exists; the pending credentials wait here.
create table companies.staff_challenges (
  id uuid primary key,
  purpose text not null check (purpose in ('sign-in', 'enrolment')),
  staff_id uuid references companies.staff_accounts (id),
  invite_id uuid references companies.staff_invites (id),
  method text not null check (method in ('totp', 'sms', 'email')),
  -- sha256 of a texted/emailed code; null for totp (the authenticator app makes its own codes).
  code_hash text,
  -- Enrolment only: what becomes the account's credentials once the first code checks out.
  pending_password_hash text,
  pending_totp_secret_ciphertext text,
  pending_phone text,
  attempts integer not null default 0,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint challenge_owner check (
    (purpose = 'sign-in' and staff_id is not null and invite_id is null)
    or (purpose = 'enrolment' and invite_id is not null and staff_id is null
        and pending_password_hash is not null)
  ),
  constraint challenge_code check ((method = 'totp') = (code_hash is null))
);

-- Ten per account, each usable once, for when the second-factor device is lost. Hashed.
create table companies.staff_recovery_codes (
  staff_id uuid not null references companies.staff_accounts (id),
  code_hash text not null,
  used_at timestamptz,
  primary key (staff_id, code_hash)
);
