-- P2-M1.12c: dashboard access belongs to staff accounts now. The driver admin flag (0012) and the
-- interim driver privileges (0018) are no longer read by anything; drop them so they can't be
-- mistaken for a way in. Anyone who needs the dashboard is invited as staff.
alter table identity.drivers drop column is_admin;
alter table identity.drivers drop column scopes;
