-- A driver's password, for email-and-password sign-in with an emailed code as the second factor (docs/driver-sign-in-plan.md).
-- A driver with no row here still signs in with a code alone, as before. The failure count and lock are per account: five wrong
-- passwords in a row lock it for 15 minutes.
--
-- To undo: drop table identity.driver_credentials;

create table identity.driver_credentials (
  driver_id uuid primary key references identity.drivers (id),
  password_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
