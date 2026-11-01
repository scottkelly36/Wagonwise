import { makeId } from '../../../shared/brand.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { Driver } from '../domain/driver.js';
import { REFRESH_LIFETIME_MS, type Session } from '../domain/session.js';
import { sha256Hex } from './hash.js';
import type { RefreshTokenGenerator } from './ports/refresh-token-generator.js';
import type { SessionRepository } from './ports/session-repository.js';
import type { AccessTokenClaims, TokenSigner } from './ports/token-signer.js';

export interface IssueSessionDeps {
  readonly sessionRepo: SessionRepository;
  readonly tokenSigner: TokenSigner;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly ids: IdGenerator;
}

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Signs a driver in: saves a session and returns the access token with the raw refresh token (only its hash is kept). Every way of
 * proving who you are (a code, a password and a code, Google, Apple) ends here, so a session is the same whichever way it began.
 */
export async function issueSession(
  deps: IssueSessionDeps,
  driver: Driver,
  now: Date,
): Promise<IssuedSession> {
  const rawRefreshToken = deps.refreshTokenGenerator.next();
  const session: Session = {
    id: makeId<'SessionId'>(deps.ids.newId()),
    driverId: driver.id,
    refreshTokenHash: sha256Hex(rawRefreshToken),
    previousRefreshTokenHash: null,
    issuedAt: now,
    lastUsedAt: now,
    refreshExpiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
    revokedAt: null,
  };
  await deps.sessionRepo.save(session);

  const claims: AccessTokenClaims = { driverId: driver.id, sessionId: session.id };
  const accessToken = await deps.tokenSigner.signAccessToken(claims);
  return { accessToken, refreshToken: rawRefreshToken };
}
