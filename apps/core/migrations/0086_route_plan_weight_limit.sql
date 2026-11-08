-- A route plan can be one the driver chose after being told no route exists for the vehicle's weight: it goes past a signed weight limit
-- (which may allow access for a delivery). The flag keeps that warning with the plan, so the route screen and a resumed trip still show it.
alter table routing.route_plans
  add column breaks_weight_limit boolean not null default false;
