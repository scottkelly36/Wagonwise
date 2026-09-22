-- M1.5: identity's own tables (design doc §9). identity as a whole is the reference module —
-- these are the first real bounded-context tables, following 0001_init.sql's schemas.

create table identity.drivers (
  id uuid primary key,
  identifier text not null unique,
  created_at timestamptz not null default now()
);

-- Seeded manually for Phase 1 (an admin/invite-issuing flow is staff-portal territory, out of
-- scope — AGENTS.md). redeemed_by and redeemed_at move together: both null or both set.
create table identity.invite_codes (
  code text primary key,
  redeemed_by uuid references identity.drivers (id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint redeemed_together check ((redeemed_by is null) = (redeemed_at is null))
);

create table identity.sessions (
  id uuid primary key,
  driver_id uuid not null references identity.drivers (id),
  refresh_token_hash text not null,
  previous_refresh_token_hash text,
  issued_at timestamptz not null,
  last_used_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz
);

-- findByRefreshTokenHash matches a hash against either column (session.rotate()'s reuse check),
-- so both need an index or that lookup seq-scans identity.sessions.
create index sessions_refresh_token_hash_idx on identity.sessions (refresh_token_hash);
create index sessions_previous_refresh_token_hash_idx on identity.sessions (previous_refresh_token_hash);

create table identity.otp_codes (
  id uuid primary key,
  identifier text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

-- findLatestFor(identifier) wants the most recent row for that identifier.
create index otp_codes_identifier_created_at_idx on identity.otp_codes (identifier, created_at desc);
