-- M6.2: identity.devices (design doc §3: Identity owns "Devices (push token)"). Upsert-only,
-- keyed by push_token (not one-row-per-driver) — a device's Expo push token is a stable
-- per-install identifier; re-registering the same token or reassigning it to a different driver
-- (same physical device, a new sign-in) both update the one row rather than creating another
-- (registerDevice, application/).

create table identity.devices (
  id uuid primary key,
  driver_id uuid not null references identity.drivers (id),
  push_token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- findByDriverId(driverId) — the read-model routing's future reroute subscriber needs (design
-- doc §6, M6.4).
create index devices_driver_id_idx on identity.devices (driver_id);
