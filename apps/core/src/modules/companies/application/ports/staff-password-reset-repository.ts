import type { StaffId } from '../../domain/staff-account.js';
import type { StaffPasswordReset } from '../../domain/staff-password-reset.js';

export interface StaffPasswordResetRepository {
  save(reset: StaffPasswordReset): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<StaffPasswordReset | null>;
  /** Marks it used, once: false when it was already used (two people opening the same link at once). */
  markUsed(id: StaffPasswordReset['id'], at: Date): Promise<boolean>;
  /** How many links this account was sent since `since`, used or not. */
  countSince(staffId: StaffId, since: Date): Promise<number>;
}
