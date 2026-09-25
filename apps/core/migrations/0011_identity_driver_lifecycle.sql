-- M8: privacy consent + account deletion (design doc §9 — "Simple privacy notice and consent
-- screen at first launch; a way for a tester to delete their account and data").
--
-- consented_at: null until the driver accepts the privacy notice/terms, set once, never cleared.
-- deleted_at: set by account deletion — the row survives (identity.sessions/devices still
-- reference it, and other modules hold this id too), but `identifier` is overwritten with an
-- opaque placeholder so the only real PII on a Driver (design doc: "Phase 1 has no profile beyond
-- the identifier they signed in with") no longer exists anywhere. A hard delete of the row itself
-- would need to cascade through identity.sessions/devices/invite_codes' FKs for no real privacy
-- benefit over scrubbing the one column that's actually personal data.
alter table identity.drivers
  add column consented_at timestamptz,
  add column deleted_at timestamptz;
