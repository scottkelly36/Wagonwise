-- Forgotten passwords: a person asks for a link, we email it, and the link lets them choose a new password once, within an hour.
-- Only a hash of the emailed token is kept, like an invitation's. A reset never skips the second factor at the next sign-in.
-- Each request and each use is also written to the staff audit log, so the two actions are added to its list.
--
-- To undo: drop table companies.staff_password_resets; then put the audit constraint back as in 0038.

create table companies.staff_password_resets (
  id uuid primary key,
  staff_id uuid not null references companies.staff_accounts (id),
  token_hash text not null unique,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- "How many requests has this person made in the last hour", for the limit on asking.
create index staff_password_resets_staff_created
  on companies.staff_password_resets (staff_id, created_at);

-- No company_id of its own: a row is visible when its account is (as for sessions and recovery codes).
alter table companies.staff_password_resets enable row level security;
create policy via_account on companies.staff_password_resets
  using (exists (select 1 from companies.staff_accounts a where a.id = staff_id))
  with check (exists (select 1 from companies.staff_accounts a where a.id = staff_id));

alter table companies.staff_audit drop constraint staff_audit_action_check;
alter table companies.staff_audit add constraint staff_audit_action_check check (action in (
  'invite_created', 'staff_joined', 'signed_in', 'sign_in_failed', 'second_factor_failed',
  'privileges_changed', 'staff_removed', 'company_settings_changed',
  'password_reset_requested', 'password_reset'
));
