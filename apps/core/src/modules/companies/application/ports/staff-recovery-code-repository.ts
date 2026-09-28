import type { StaffId } from '../../domain/staff-account.js';

export interface StaffRecoveryCodeRepository {
  /** Replaces any existing codes (a fresh set is issued at enrolment, or on request). */
  replaceAll(staffId: StaffId, codeHashes: readonly string[]): Promise<void>;
  /** Marks the matching unused code as used. False if there's no such unused code. */
  use(staffId: StaffId, codeHash: string, at: Date): Promise<boolean>;
  countUnused(staffId: StaffId): Promise<number>;
}
