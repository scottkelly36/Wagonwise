import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { isRevoked, revoke, type SessionId } from '../domain/session.js';
import type { SessionRepository } from './ports/session-repository.js';

export type SessionNotFound = TaggedError<'SessionNotFound'>;

export interface RevokeSessionDeps {
  readonly sessionRepo: SessionRepository;
  readonly clock: Clock;
}

export interface RevokeSessionInput {
  readonly sessionId: SessionId;
}

/**
 * Sign-out. Idempotent: revoking an already-revoked session is not an error — sign-out must
 * never fail just because the driver tapped it twice or another tab already did it.
 */
export async function revokeSession(
  deps: RevokeSessionDeps,
  input: RevokeSessionInput,
): Promise<Result<void, SessionNotFound>> {
  const session = await deps.sessionRepo.findById(input.sessionId);
  if (!session) {
    return err({ tag: 'SessionNotFound' });
  }
  if (!isRevoked(session)) {
    await deps.sessionRepo.save(revoke(session, deps.clock.now()));
  }
  return ok(undefined);
}
