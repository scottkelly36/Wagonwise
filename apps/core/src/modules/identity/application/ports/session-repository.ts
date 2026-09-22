import type { Session, SessionId } from '../../domain/session.js';

export interface SessionRepository {
  /** Matches either the current or the previous refresh-token hash — session.rotate()'s job is
   *  telling those two cases apart once the row is found; the lookup itself doesn't need to. */
  findByRefreshTokenHash(hash: string): Promise<Session | null>;
  findById(id: SessionId): Promise<Session | null>;
  save(session: Session): Promise<void>;
}
