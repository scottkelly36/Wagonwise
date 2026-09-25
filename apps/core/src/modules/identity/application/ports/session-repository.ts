import type { DriverId } from '../../domain/driver.js';
import type { Session, SessionId } from '../../domain/session.js';

export interface SessionRepository {
  /** Matches either the current or the previous refresh-token hash — session.rotate()'s job is
   *  telling those two cases apart once the row is found; the lookup itself doesn't need to. */
  findByRefreshTokenHash(hash: string): Promise<Session | null>;
  findById(id: SessionId): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** M8's `deleteAccount` — every one of a driver's sessions dies at once, not just the one
   *  making the request, so a stolen refresh token elsewhere stops working immediately too. Bulk
   *  rather than find-all-then-save-each, since there's nothing per-session to decide here (unlike
   *  `rotate()`). */
  revokeAllForDriver(driverId: DriverId, now: Date): Promise<void>;
}
