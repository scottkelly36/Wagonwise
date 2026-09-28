import type { StaffTokenIssuer } from '../application/ports/staff-token-issuer.js';
import type { StaffAccount } from '../domain/staff-account.js';
import type { StaffSessionId } from '../domain/staff-session.js';

/**
 * `StaffTokenIssuer` over identity's facade (`IdentityModule.signStaffAccessToken`), passed in
 * as a function so `companies` never imports identity (AGENTS.md rules 6-7). Identity signs with
 * core's one Ed25519 key and marks the token `kind: 'staff'`.
 */
export class IdentityStaffTokenIssuer implements StaffTokenIssuer {
  constructor(
    private readonly signStaffAccessToken: (staffId: string, sessionId: string) => Promise<string>,
  ) {}

  issue(staff: StaffAccount, sessionId: StaffSessionId): Promise<string> {
    return this.signStaffAccessToken(staff.id, sessionId);
  }
}
