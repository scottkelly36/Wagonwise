-- P2-M1.12: the sign-in lockout counts an account's recent failures on every sign-in attempt
-- (`application/lockout.ts`). This keeps that a short index range scan as the log grows.
create index staff_audit_target_action_at_idx
  on companies.staff_audit (target_id, action, at desc);
