-- How long a company's proof-of-delivery photos are kept. The company is the controller of its delivery
-- records, so it chooses; WagonWise deletes on that instruction. Default 12 months. A daily task in core
-- deletes photos older than each company's setting.
alter table companies.companies
  add column photo_retention_months integer not null default 12
  check (photo_retention_months between 1 and 120);

-- Changing it is a privacy-relevant staff action, so it is audited.
alter table companies.staff_audit drop constraint staff_audit_action_check;
alter table companies.staff_audit add constraint staff_audit_action_check check (action in (
  'invite_created', 'staff_joined', 'signed_in', 'sign_in_failed', 'second_factor_failed',
  'privileges_changed', 'staff_removed', 'company_settings_changed'
));
