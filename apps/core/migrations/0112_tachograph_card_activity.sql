-- The period a driver card download holds activity for, and on how many of those days the card was in use for driving, work or
-- availability, read from the file when it is received (docs/tachograph-download-scope.md, reading the files, step 2). Nothing else of
-- the activity is kept. The bytes are still kept exactly as received. All three are null when the file did not read as a driver card
-- download with activity on it (a different layout, a damaged copy, a vehicle unit file): a file is never refused for that.
-- Files received before this migration are left null.
alter table tachograph.files
  add column activity_from date,
  add column activity_to date,
  add column activity_work_days integer,
  add constraint files_activity_whole check (
    (activity_from is null and activity_to is null and activity_work_days is null)
    or (activity_from is not null and activity_to is not null and activity_work_days is not null
        and activity_from <= activity_to
        and activity_work_days between 0 and (activity_to - activity_from) + 1)
  );
