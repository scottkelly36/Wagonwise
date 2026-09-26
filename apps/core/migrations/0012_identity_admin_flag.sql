-- Lets one driver's account be flagged as an admin (2026-09-26 field-testing request: "give my
-- account the ability to remove hazards, I've been making some as tests"). Per-account truth
-- rather than a server-config allowlist, deliberately: it survives independently of how/where
-- core is deployed, and it's the kind of fact that belongs on the account, not in an env var.
-- No self-service way to grant this in Phase 1 — it's set directly in the database, once, for
-- whichever account needs it.
alter table identity.drivers
  add column is_admin boolean not null default false;
