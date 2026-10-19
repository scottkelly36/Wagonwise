-- Feedback notes can now be read by WagonWise staff in the portal and marked resolved. A note is open until resolved_at is set;
-- reopening clears it. Notes already sent are open.
--
-- To undo: alter table feedback.notes drop column resolved_at;

alter table feedback.notes add column resolved_at timestamptz;
create index notes_created_idx on feedback.notes (created_at desc);
