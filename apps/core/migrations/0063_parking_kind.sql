-- What sort of place a spot is, so the map can show lay-bys as their own layer. A lay-by is a roadside stop that nobody has checked
-- suits a lorry; a parking spot is a lorry park, truck stop or service area, or one a driver or staff vouched for. Existing
-- spots are parking spots.
alter table parking.safe_parking_spots
  add column kind text not null default 'parking' check (kind in ('parking', 'layby'));
