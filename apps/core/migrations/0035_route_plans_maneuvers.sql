-- P2-M10: turn-by-turn steps for spoken directions. One jsonb array per plan, the engine's turn list
-- mapped to routing's own `Maneuver` kinds (see routing/domain/maneuver.ts). A plan made before this
-- existed has none ('[]'), and the driver app then simply gives no spoken directions for it.
--
-- jsonb on the plan, not a table of its own: a plan is immutable and written once (decision 10), the
-- steps are only ever read back whole with it, and nothing queries them individually.
alter table routing.route_plans
  add column maneuvers jsonb not null default '[]'::jsonb;
