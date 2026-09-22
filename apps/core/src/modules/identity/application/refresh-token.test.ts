import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { REFRESH_LIFETIME_MS, type Session } from '../domain/session.js';
import { sha256Hex } from './hash.js';
import { refreshToken, type RefreshTokenDeps } from './refresh-token.js';
import { FakeTokenSigner } from './testing/fake-token-signer.js';
import { SequentialRefreshTokenGenerator } from './testing/sequential-refresh-token-generator.js';
import { InMemorySessionRepository } from './testing/in-memory-session-repository.js';

const now = new Date('2026-06-15T08:00:00.000Z');
const CURRENT_RAW = 'current-raw-token';
const PREVIOUS_RAW = 'previous-raw-token';

function activeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: makeId<'SessionId'>('session-1'),
    driverId: makeId<'DriverId'>('driver-1'),
    refreshTokenHash: sha256Hex(CURRENT_RAW),
    previousRefreshTokenHash: null,
    issuedAt: new Date('2026-06-01T00:00:00.000Z'),
    lastUsedAt: new Date('2026-06-01T00:00:00.000Z'),
    refreshExpiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
    revokedAt: null,
    ...overrides,
  };
}

function buildDeps(overrides: Partial<RefreshTokenDeps> = {}): RefreshTokenDeps {
  return {
    sessionRepo: new InMemorySessionRepository(),
    tokenSigner: new FakeTokenSigner(),
    refreshTokenGenerator: new SequentialRefreshTokenGenerator(),
    clock: new FakeClock(now),
    ...overrides,
  };
}

describe('refreshToken', () => {
  it('reports SessionNotFound for an unknown token', async () => {
    const deps = buildDeps();
    const result = await refreshToken(deps, { refreshToken: 'never-issued' });
    expect(result).toEqual({ ok: false, error: { tag: 'SessionNotFound' } });
  });

  it('rotates on the current token: new tokens out, session saved with the new hash', async () => {
    const sessionRepo = new InMemorySessionRepository();
    const session = activeSession();
    await sessionRepo.save(session);
    const deps = buildDeps({ sessionRepo });

    const result = await refreshToken(deps, { refreshToken: CURRENT_RAW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refreshToken).toBe('refresh-token-1');
    expect(result.value.accessToken).toContain(session.driverId);

    const saved = await sessionRepo.findById(session.id);
    expect(saved?.refreshTokenHash).toBe(sha256Hex('refresh-token-1'));
    expect(saved?.previousRefreshTokenHash).toBe(sha256Hex(CURRENT_RAW));
    expect(saved?.revokedAt).toBeNull();
  });

  it('revokes the whole session when a rotated-away token is replayed', async () => {
    const sessionRepo = new InMemorySessionRepository();
    const session = activeSession({ previousRefreshTokenHash: sha256Hex(PREVIOUS_RAW) });
    await sessionRepo.save(session);
    const deps = buildDeps({ sessionRepo });

    const result = await refreshToken(deps, { refreshToken: PREVIOUS_RAW });
    expect(result).toEqual({ ok: false, error: { tag: 'RefreshTokenReused' } });

    const saved = await sessionRepo.findById(session.id);
    expect(saved?.revokedAt).toEqual(now);
  });

  it('a subsequent attempt on the now-revoked session reports SessionRevoked, not reused again', async () => {
    const sessionRepo = new InMemorySessionRepository();
    const session = activeSession({ previousRefreshTokenHash: sha256Hex(PREVIOUS_RAW) });
    await sessionRepo.save(session);
    const deps = buildDeps({ sessionRepo });

    await refreshToken(deps, { refreshToken: PREVIOUS_RAW }); // triggers revocation
    const second = await refreshToken(deps, { refreshToken: CURRENT_RAW });
    expect(second).toEqual({ ok: false, error: { tag: 'SessionRevoked' } });
  });

  it('reports SessionRevoked for an already-revoked session', async () => {
    const sessionRepo = new InMemorySessionRepository();
    await sessionRepo.save(activeSession({ revokedAt: new Date('2026-06-10T00:00:00.000Z') }));
    const deps = buildDeps({ sessionRepo });

    const result = await refreshToken(deps, { refreshToken: CURRENT_RAW });
    expect(result).toEqual({ ok: false, error: { tag: 'SessionRevoked' } });
  });

  it('reports SessionExpired once the sliding window has passed', async () => {
    const sessionRepo = new InMemorySessionRepository();
    await sessionRepo.save(activeSession({ refreshExpiresAt: new Date(now.getTime() - 1) }));
    const deps = buildDeps({ sessionRepo });

    const result = await refreshToken(deps, { refreshToken: CURRENT_RAW });
    expect(result).toEqual({ ok: false, error: { tag: 'SessionExpired' } });
  });

  it('rejects an unrelated token even when a previous hash exists', async () => {
    const sessionRepo = new InMemorySessionRepository();
    await sessionRepo.save(activeSession({ previousRefreshTokenHash: sha256Hex(PREVIOUS_RAW) }));
    const deps = buildDeps({ sessionRepo });

    const result = await refreshToken(deps, { refreshToken: 'garbage' });
    expect(result).toEqual({ ok: false, error: { tag: 'SessionNotFound' } });
  });
});
