-- Whether the automatic rules for company account states run (docs/company-account-states-scope.md, item 3).
--   'off'      nothing happens by itself (how it starts: the owner switches it on once, after seeing the dates move correctly)
--   'no_pause' emails and the move from a finished free period to overdue; nothing is ever paused automatically
--   'full'     as above, and an overdue company is paused when its grace period has passed
-- A company with the owner's "never pause" hold is skipped in every mode.

alter table companies.account_settings
  add column automation text not null default 'off'
    check (automation in ('off', 'no_pause', 'full'));
