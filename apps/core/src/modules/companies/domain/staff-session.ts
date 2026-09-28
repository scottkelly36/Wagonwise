import type { Id } from '../../../shared/brand.js';
import type { StaffId } from './staff-account.js';

export type StaffSessionId = Id<'StaffSessionId'>;

/**
 * One browser's ongoing staff sign-in. Same rotation and reuse-detection shape as identity's
 * driver sessions (hashes only, the previous hash kept to spot a replayed refresh token), but
 * its own type: modules don't share domain code (AGENTS.md rule 6). The rotate/revoke rules
 * arrive with the sign-in use cases (P2-M1.5).
 */
export interface StaffSession {
  readonly id: StaffSessionId;
  readonly staffId: StaffId;
  readonly refreshTokenHash: string;
  readonly previousRefreshTokenHash: string | null;
  readonly issuedAt: Date;
  readonly lastUsedAt: Date;
  readonly refreshExpiresAt: Date;
  readonly revokedAt: Date | null;
}
