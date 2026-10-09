-- What the office needs to put a sharing driver's breaks into an arrival time: the length of a break, the driving allowed
-- between breaks, and the driving left before a rest is needed. All nullable: an older app does not send them, and then
-- no break is added to the arrival. Rule lengths and a time left, nothing about what the driver did.
alter table hours.status
  add column break_min integer check (break_min is null or break_min >= 0),
  add column stretch_min integer check (stretch_min is null or stretch_min >= 0),
  add column until_limit_min integer check (until_limit_min is null or until_limit_min >= 0);
