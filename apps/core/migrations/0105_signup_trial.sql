-- A firm that registered on the website and was given a trial from the portal's Testers page (one button: makes the company on a
-- free trial and emails its first admin the link to join). When, and which company: no foreign key, because the company belongs to
-- another module. Null until the button is pressed, and the page never makes a second firm from the same sign-up.
--
-- To undo: alter table signups.testers drop column trial_started_at, drop column trial_company_id;

alter table signups.testers
  add column trial_started_at timestamptz,
  add column trial_company_id uuid;
