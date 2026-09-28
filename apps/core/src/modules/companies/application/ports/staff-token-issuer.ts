import type { StaffAccount } from '../../domain/staff-account.js';
import type { StaffSessionId } from '../../domain/staff-session.js';

/**
 * Signs a short-lived staff access token. Implemented in P2-M1.6 over core's Ed25519 key with a
 * `kind: 'staff'` claim, so a staff token can never be used on driver routes or the reverse.
 */
export interface StaffTokenIssuer {
  issue(staff: StaffAccount, sessionId: StaffSessionId): Promise<string>;
}
