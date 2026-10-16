-- Which testers have been sent the standard invite email from the portal's Testers page, when, and the invite code
-- (identity.invite_codes) that went with it. Both stay null until an invite is sent; sending one sets both together.
--
-- To undo: alter table signups.testers drop column invited_at, drop column invite_code;

alter table signups.testers
  add column invited_at timestamptz,
  add column invite_code text,
  add constraint testers_invite_together check ((invited_at is null) = (invite_code is null));
