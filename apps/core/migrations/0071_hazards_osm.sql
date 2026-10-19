-- Hazards can come from OpenStreetMap as well as from drivers: the starting set in migration 0072. An imported hazard has
-- source = 'osm' and keeps its OpenStreetMap id, so a re-run can never insert one twice. Drivers' reports have no osm_id.
--
-- To undo: drop index hazards.reports_osm_id_idx; alter table hazards.reports drop column osm_id;

alter table hazards.reports add column osm_id text;
create unique index reports_osm_id_idx on hazards.reports (osm_id) where osm_id is not null;
