import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  revoke,
  rotate,
  type RefreshTokenInvalid,
  type RefreshTokenReused,
  type SessionExpired,
  type SessionRevoked,
} from '../domain/session.js';
import { sha256Hex } from './hash.js';
import type { RefreshTokenGenerator } from './ports/refresh-token-generator.js';
import type { SessionRepository } from './ports/session-repository.js';
import type { AccessTokenClaims, TokenSigner } from './ports/token-signer.js';

export type SessionNotFound = TaggedError<'SessionNotFound'>;

export interface RefreshTokenDeps {
  readonly sessionRepo: SessionRepository;
  readonly tokenSigner: TokenSigner;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly clock: Clock;
}

export interface RefreshTokenInput {
  readonly refreshToken: string;
}

export interface RefreshTokenResult {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export type RefreshTokenError =
  SessionNotFound | SessionRevoked | SessionExpired | RefreshTokenReused | RefreshTokenInvalid;

/**
 * The app refreshes opportunistically, never only on a 401 (design doc §8) — this is the one
 * function that keeps a driver signed in for months without ever re-entering an OTP, and the one
 * that ends a stolen refresh token's usefulness the instant it's replayed.
 */
export async function refreshToken(
  deps: RefreshTokenDeps,
  input: RefreshTokenInput,
): Promise<Result<RefreshTokenResult, RefreshTokenError>> {
  const presentedHash = sha256Hex(input.refreshToken);
  const session = await deps.sessionRepo.findByRefreshTokenHash(presentedHash);
  if (!session) {
    return err({ tag: 'SessionNotFound' });
  }

  const now = deps.clock.now();
  const newRawToken = deps.refreshTokenGenerator.next();
  const rotated = rotate(session, presentedHash, sha256Hex(newRawToken), now);

  if (!rotated.ok) {
    if (rotated.error.tag === 'RefreshTokenReused') {
      // The whole point of reuse detection: don't just reject this attempt, kill the session.
      await deps.sessionRepo.save(revoke(session, now));
    }
    return rotated;
  }

  await deps.sessionRepo.save(rotated.value);
  const claims: AccessTokenClaims = { driverId: session.driverId, sessionId: session.id };
  const accessToken = await deps.tokenSigner.signAccessToken(claims);
  return ok({ accessToken, refreshToken: newRawToken });
}
