import type { Id } from '../../../shared/brand.js';
import type { CompanyId } from './company.js';
import type { StaffId } from './staff-account.js';

export type StaffAuditEntryId = Id<'StaffAuditEntryId'>;

/**
 * What the staff audit log records (P2-M1.11). Security-relevant events only: sign-in, joining,
 * and every change to who can do what. Routine reads and token refreshes aren't recorded.
 *
 * - `invite_created`: someone was invited. Details: `email`, `kind`, `privileges`.
 * - `staff_joined`: an invite was accepted and the account created. Details: `method`.
 * - `signed_in`: password and second factor both passed. Details: `method`, or `recovery_code`.
 * - `sign_in_failed`: a known account's password was wrong. Unknown emails aren't recorded: there
 *   is no account (or company) to file them under.
 * - `second_factor_failed`: a wrong code at the second step.
 * - `privileges_changed`: details `before`, `after`.
 * - `staff_removed`: details `email`.
 */
export const STAFF_AUDIT_ACTIONS = [
  'invite_created',
  'staff_joined',
  'signed_in',
  'sign_in_failed',
  'second_factor_failed',
  'privileges_changed',
  'staff_removed',
] as const;
export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number];

export type StaffAuditDetails = Readonly<Record<string, string | readonly string[]>>;

export interface StaffAuditEntry {
  readonly id: StaffAuditEntryId;
  readonly at: Date;
  readonly action: StaffAuditAction;
  /** Who did it. Absent when nobody was signed in yet (a failed sign-in, joining). */
  readonly actorId?: StaffId | undefined;
  /** The company it concerns. Absent for WagonWise staff accounts, which belong to none: only
   *  WagonWise admins see those entries. */
  readonly companyId?: CompanyId | undefined;
  /** Whose account it concerns, when that's someone (a removal, a sign-in). */
  readonly targetId?: StaffId | undefined;
  readonly details: StaffAuditDetails;
}
