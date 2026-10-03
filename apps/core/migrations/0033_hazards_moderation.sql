-- P2-M7.1: the audit trail for hazard moderation (Phase 2 tech design doc §7: "every decision is
-- recorded (ModerationDecision) for audit"). One row per decision a WagonWise moderator makes:
-- approve, reject, edit, or change a report's lifetime.
--
-- No foreign key to hazards.reports, on purpose: a moderator may later delete a report outright
-- (the existing admin delete), and the record of what was decided about it should outlive that.
-- before/after are jsonb snapshots of just the fields moderation can change (type, measurement,
-- status, expiry), so a decision can be read back without joining to a report that has since moved
-- on — a small append-only log, like companies.staff_audit's details (0022_staff_audit.sql).
create table hazards.moderation_decisions (
  id uuid primary key,
  hazard_id uuid not null,
  moderator_id uuid not null,
  action text not null check (action in ('approve', 'reject', 'edit', 'set_lifetime')),
  note text,
  before jsonb not null,
  after jsonb not null,
  decided_at timestamptz not null
);

-- "Has this report been approved?" (the queue) and "what was decided about it?" (the audit view).
create index moderation_decisions_hazard_id_idx on hazards.moderation_decisions (hazard_id, decided_at);
