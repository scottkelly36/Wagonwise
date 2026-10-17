-- Drivers can suggest a change to a parking spot (a better name, how many lorries it takes, its facilities, a note) or say it is
-- closed or gone. Nothing changes on the map until WagonWise staff approve it, so these wait here. Deciding one (approve or
-- reject) deletes it, so only what is still waiting is held, and a driver who deletes their account takes theirs with them.
-- One waiting suggestion per driver per place: a second replaces the first.
--
-- To undo: drop table parking.spot_edit_suggestions;

create table parking.spot_edit_suggestions (
  id uuid primary key,
  spot_id uuid not null references parking.safe_parking_spots (id) on delete cascade,
  suggester_id uuid not null,
  -- True means "this place is closed or gone": approving it deletes the spot. Otherwise `changes` holds just the fields the
  -- driver wants changed (name, capacity, note and the facility yes/no answers).
  gone boolean not null default false,
  changes jsonb not null default '{}'::jsonb,
  suggested_at timestamptz not null,
  unique (spot_id, suggester_id),
  check (gone or changes <> '{}'::jsonb)
);

create index spot_edit_suggestions_suggester_idx on parking.spot_edit_suggestions (suggester_id);
create index spot_edit_suggestions_time_idx on parking.spot_edit_suggestions (suggested_at);

grant select, insert, update, delete on parking.spot_edit_suggestions to wagonwise_app;
