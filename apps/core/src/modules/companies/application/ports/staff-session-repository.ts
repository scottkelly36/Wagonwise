import type { StaffId } from '../../domain/staff-account.js';
import type { StaffSession, StaffSessionId } from '../../domain/staff-session.js';

export interface StaffSessionRepository {
  /** Matches the current or the previous refresh-token hash (reuse detection decides which). */
  findByRefreshTokenHash(hash: string): Promise<StaffSession | null>;
  findById(id: StaffSessionId): Promise<StaffSession | null>;
  save(session: StaffSession): Promise<void>;
  /** Signs someone out everywhere: on removal, a password change, or a replayed refresh token. */
  revokeAllForStaff(staffId: StaffId, now: Date): Promise<void>;
}
