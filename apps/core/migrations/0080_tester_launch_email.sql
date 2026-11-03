-- When a tester was sent the "WagonWise is out now" email from the portal's Testers page. Null until it is sent, and the page
-- never sends a second one to the same person.
--
-- To undo: alter table signups.testers drop column launch_emailed_at;

alter table signups.testers
  add column launch_emailed_at timestamptz;
