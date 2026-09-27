-- Route options, M9 (docs/progress.md): a rough fuel-cost estimate per route, so a driver can
-- compare fastest/shortest before picking one — both nullable, since neither is required for the
-- app to keep working exactly as before for a profile/plan that doesn't have one.
-- `double precision`, not `numeric`, same reasoning as 0003_routing.sql's own dimension columns:
-- these are rough estimates, not currency needing exact decimal arithmetic, and node-postgres
-- returns `numeric` as a string rather than a number.
alter table routing.vehicle_profiles add column fuel_consumption_l100km double precision;
alter table routing.route_plans add column estimated_fuel_cost_gbp double precision;
