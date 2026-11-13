-- A route plan can be one the driver chose for having no toll (the Toll free card, or a re-plan that keeps avoiding tolls). The flag keeps that choice with
-- the plan, so a re-route the server works out itself, when a hazard is reported ahead, avoids tolls too, and so a plan fetched again by the app carries it.
alter table routing.route_plans
  add column avoids_tolls boolean not null default false;
