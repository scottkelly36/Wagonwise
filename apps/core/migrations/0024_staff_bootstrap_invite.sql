-- P2-M1.12b: the very first WagonWise admin is invited by nobody: `pnpm staff:bootstrap` issues
-- that one invite while no WagonWise admin exists. Every other invite still names its inviter
-- (enforced in core; the column just allows the one exception).
alter table companies.staff_invites alter column invited_by drop not null;
