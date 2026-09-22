import type { Session, SessionId } from '../../domain/session.js';
import type { SessionRepository } from '../ports/session-repository.js';

export class InMemorySessionRepository implements SessionRepository {
  #byId = new Map<SessionId, Session>();

  findByRefreshTokenHash(hash: string): Promise<Session | null> {
    for (const session of this.#byId.values()) {
      if (session.refreshTokenHash === hash || session.previousRefreshTokenHash === hash) {
        return Promise.resolve(session);
      }
    }
    return Promise.resolve(null);
  }

  findById(id: SessionId): Promise<Session | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  save(session: Session): Promise<void> {
    this.#byId.set(session.id, session);
    return Promise.resolve();
  }
}
