-- What a driver card download says about the card, read from the file when it is received (docs/tachograph-download-scope.md, reading the
-- files, step 1). The bytes are still kept exactly as received; these columns are only what the portal shows beside the file: the card
-- number, the holder's name, the day the card runs out, and which generations of the card the file holds. All are null when the file did
-- not read as a driver card download (a different layout, a damaged copy, a vehicle unit file): a file is never refused for that.
-- Files received before this migration are left null.
alter table tachograph.files
  add column card_number text,
  add column card_holder_name text,
  add column card_expires_on date,
  add column card_generations text check (card_generations in ('1', '2', '1,2'));
