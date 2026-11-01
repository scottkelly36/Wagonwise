-- A driver's Google or Apple sign-in, stored by the provider's own stable id for them (`subject`), never by email, which can change at
-- the provider. One row per provider per driver; a driver can have both. Removed with the account.
--
-- To undo: drop table identity.federated_identities;

create table identity.federated_identities (
  provider text not null check (provider in ('google', 'apple')),
  subject text not null,
  driver_id uuid not null references identity.drivers (id),
  email text,
  created_at timestamptz not null default now(),
  primary key (provider, subject)
);
