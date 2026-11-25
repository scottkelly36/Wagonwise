-- The link emailed to a firm that registers on the website: opened, it lets the firm start its own free trial after proving the address is
-- theirs. Only the hash of the link's secret is kept (like a staff invitation), with when it stops working. Null until a link is sent.
-- One live link per sign-up: a new one replaces the old.
--
-- To undo: drop index signups.testers_trial_token_hash_key; alter table signups.testers drop column trial_token_hash, drop column trial_token_expires_at;

alter table signups.testers
  add column trial_token_hash text,
  add column trial_token_expires_at timestamptz;

create unique index testers_trial_token_hash_key
  on signups.testers (trial_token_hash)
  where trial_token_hash is not null;
