import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  isRevoked,
  REFRESH_LIFETIME_MS,
  REUSE_GRACE_MS,
  revoke,
  rotate,
  type Session,
} from './session.js';

const now = new Date('2026-06-15T08:00:00.000Z');
const CURRENT_HASH = 'hash-current';
const PREVIOUS_HASH = 'hash-previous';
const NEW_HASH = 'hash-new';

function freshSession(overrides: Partial<Session> = {}): Session {
  return {
    id: makeId<'SessionId'>('session-1'),
    driverId: makeId<'DriverId'>('driver-1'),
    refreshTokenHash: CURRENT_HASH,
    previousRefreshTokenHash: null,
    issuedAt: new Date('2026-06-01T00:00:00.000Z'),
    lastUsedAt: new Date('2026-06-01T00:00:00.000Z'),
    refreshExpiresAt: new Date('2026-08-01T00:00:00.000Z'), // well after `now`
    revokedAt: null,
    ...overrides,
  };
}

describe('isRevoked / revoke', () => {
  it('a fresh session is not revoked', () => {
    expect(isRevoked(freshSession())).toBe(false);
  });

  it('revoke sets revokedAt and nothing else', () => {
    const session = freshSession();
    const revoked = revoke(session, now);
    expect(revoked).toEqual({ ...session, revokedAt: now });
    expect(isRevoked(revoked)).toBe(true);
    expect(isRevoked(session)).toBe(false); // original untouched
  });
});

describe('rotate', () => {
  it('rotates forward on the current hash: new becomes current, current becomes previous', () => {
    const session = freshSession();
    const result = rotate(session, CURRENT_HASH, NEW_HASH, now);
    expect(result).toEqual({
      ok: true,
      value: {
        ...session,
        refreshTokenHash: NEW_HASH,
        previousRefreshTokenHash: CURRENT_HASH,
        lastUsedAt: now,
        refreshExpiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
      },
    });
  });

  it('slides the expiry window forward on every successful rotation', () => {
    const session = freshSession({ refreshExpiresAt: new Date(now.getTime() + 1000) });
    const result = rotate(session, CURRENT_HASH, NEW_HASH, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.refreshExpiresAt).toEqual(new Date(now.getTime() + REFRESH_LIFETIME_MS));
    }
  });

  it('reports reuse when the presented hash matches the previous one, long after it was swapped', () => {
    const session = freshSession({
      previousRefreshTokenHash: PREVIOUS_HASH,
      lastUsedAt: new Date(now.getTime() - REUSE_GRACE_MS - 1000),
    });
    const result = rotate(session, PREVIOUS_HASH, NEW_HASH, now);
    expect(result).toEqual({ ok: false, error: { tag: 'RefreshTokenReused' } });
  });

  it('treats the previous token, shortly after the swap, as a retry: a fresh current token and the old one stays the previous', () => {
    const swappedAt = new Date(now.getTime() - 5 * 60 * 1000);
    const session = freshSession({
      refreshTokenHash: CURRENT_HASH,
      previousRefreshTokenHash: PREVIOUS_HASH,
      lastUsedAt: swappedAt,
    });
    const result = rotate(session, PREVIOUS_HASH, NEW_HASH, now);
    expect(result).toEqual({
      ok: true,
      value: {
        ...session,
        refreshTokenHash: NEW_HASH,
        previousRefreshTokenHash: PREVIOUS_HASH,
        // The window still runs from the original swap, so replaying a stolen token cannot extend it.
        lastUsedAt: swappedAt,
        refreshExpiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
      },
    });
  });

  it('allows the same old token to be tried again inside the window, and not once the window has passed', () => {
    const swappedAt = new Date(now.getTime() - 5 * 60 * 1000);
    let session = freshSession({ previousRefreshTokenHash: PREVIOUS_HASH, lastUsedAt: swappedAt });
    const first = rotate(session, PREVIOUS_HASH, 'hash-3', now);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    session = first.value;
    expect(rotate(session, PREVIOUS_HASH, 'hash-4', new Date(now.getTime() + 60_000)).ok).toBe(
      true,
    );
    const late = new Date(swappedAt.getTime() + REUSE_GRACE_MS + 1000);
    expect(rotate(session, PREVIOUS_HASH, 'hash-5', late)).toEqual({
      ok: false,
      error: { tag: 'RefreshTokenReused' },
    });
  });

  it('reports invalid for a hash matching neither current nor previous', () => {
    const session = freshSession({ previousRefreshTokenHash: PREVIOUS_HASH });
    const result = rotate(session, 'hash-unknown', NEW_HASH, now);
    expect(result).toEqual({ ok: false, error: { tag: 'RefreshTokenInvalid' } });
  });

  it('reports invalid, not reused, when there is no previous hash at all', () => {
    const session = freshSession({ previousRefreshTokenHash: null });
    const result = rotate(session, 'hash-unknown', NEW_HASH, now);
    expect(result).toEqual({ ok: false, error: { tag: 'RefreshTokenInvalid' } });
  });

  it('reports revoked before checking the hash at all, even with the right current hash', () => {
    const session = revoke(freshSession(), now);
    const result = rotate(session, CURRENT_HASH, NEW_HASH, now);
    expect(result).toEqual({ ok: false, error: { tag: 'SessionRevoked' } });
  });

  it('reports expired once the sliding window has passed, even with the right current hash', () => {
    const session = freshSession({ refreshExpiresAt: new Date(now.getTime() - 1) });
    const result = rotate(session, CURRENT_HASH, NEW_HASH, now);
    expect(result).toEqual({ ok: false, error: { tag: 'SessionExpired' } });
  });

  it('checks revocation before expiry, but either way this session cannot rotate', () => {
    const session = revoke(
      freshSession({ refreshExpiresAt: new Date(now.getTime() - 1) }),
      new Date(now.getTime() - 1),
    );
    const result = rotate(session, CURRENT_HASH, NEW_HASH, now);
    expect(result).toEqual({ ok: false, error: { tag: 'SessionRevoked' } });
  });

  it('does not mutate the original session', () => {
    const session = freshSession();
    rotate(session, CURRENT_HASH, NEW_HASH, now);
    expect(session.refreshTokenHash).toBe(CURRENT_HASH);
  });
});
