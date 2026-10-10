import { ApiError } from '../api/errors';

/**
 * Why a refresh of the sign-in failed, and so what to do about it.
 *
 *   - `dead`: the server said, in so many words, that this sign-in is over (revoked, expired, replayed, or never existed). The
 *     driver has to sign in again.
 *   - `transient`: anything else: no signal, a tunnel, a timeout, the server restarting, a 5xx. Nothing is wrong with the
 *     sign-in; try again later and keep the driver signed in. Signing a driver out because their phone had no signal for a
 *     moment was the bug this replaces.
 */
export type RefreshFailure = 'dead' | 'transient';

const DEAD_TAGS: ReadonlySet<string> = new Set([
  'SessionNotFound',
  'SessionRevoked',
  'SessionExpired',
  'RefreshTokenReused',
  'RefreshTokenInvalid',
  'DriverNotFound',
]);

export function classifyRefreshFailure(error: unknown): RefreshFailure {
  return error instanceof ApiError && DEAD_TAGS.has(error.tag) ? 'dead' : 'transient';
}

const RETRY_STEPS_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;

/** How long to wait before trying again after `failures` failures in a row: 15 seconds, then longer, up to 5 minutes. */
export function retryDelayMs(failures: number): number {
  const index = Math.min(Math.max(failures, 1), RETRY_STEPS_MS.length) - 1;
  return RETRY_STEPS_MS[index] as number;
}
