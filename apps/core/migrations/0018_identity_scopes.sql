-- Fleet-user scopes (Phase 2 tech design doc's decision log, 2026-09-27's 3-tier permission
-- model, first slice): a fixed, WagonWise-defined list of extra capabilities a company-scoped
-- driver can be granted, starting with `manage_fleet`. jsonb, not a native postgres array — same
-- reasoning as routing.route_plans' avoided_restrictions/hazards_on_route (decision, M2.5):
-- node-postgres already needs a JSON round trip for jsonb, and a fixed short string list has no
-- need for array-specific SQL operators.
alter table identity.drivers add column scopes jsonb not null default '[]'::jsonb;
