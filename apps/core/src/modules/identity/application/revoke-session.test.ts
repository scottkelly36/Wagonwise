import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { Session } from '../domain/session.js';
import { revokeSession, type RevokeSessionDeps } from './revoke-session.js';
import { InMemorySessionRepository } from './testing/in-memory-session-repository.js';

const now = new Date('2026-06-15T08:00:00.000Z');

function activeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: makeId<'SessionId'>('session-1'),
    driverId: makeId<'DriverId'>('driver-1'),
    refreshTokenHash: 'hash',
    previousRefreshTokenHash: null,
    issuedAt: new Date('2026-06-01T00:00:00.000Z'),
    lastUsedAt: new Date('2026-06-01T00:00:00.000Z'),
    refreshExpiresAt: new Date('2026-08-01T00:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}

function buildDeps(overrides: Partial<RevokeSessionDeps> = {}): RevokeSessionDeps {
  return {
    sessionRepo: new InMemorySessionRepository(),
    clock: new FakeClock(now),
    ...overrides,
  };
}

describe('revokeSession', () => {
  it('reports SessionNotFound for an unknown session', async () => {
    const deps = buildDeps();
    const result = await revokeSession(deps, { sessionId: makeId<'SessionId'>('nope') });
    expect(result).toEqual({ ok: false, error: { tag: 'SessionNotFound' } });
  });

  it('revokes an active session', async () => {
    const sessionRepo = new InMemorySessionRepository();
    const session = activeSession();
    await sessionRepo.save(session);
    const deps = buildDeps({ sessionRepo });

    const result = await revokeSession(deps, { sessionId: session.id });
    expect(result).toEqual({ ok: true, value: undefined });

    const saved = await sessionRepo.findById(session.id);
    expect(saved?.revokedAt).toEqual(now);
  });

  it('is idempotent: revoking an already-revoked session succeeds without changing revokedAt', async () => {
    const sessionRepo = new InMemorySessionRepository();
    const earlierRevocation = new Date('2026-06-10T00:00:00.000Z');
    const session = activeSession({ revokedAt: earlierRevocation });
    await sessionRepo.save(session);
    const deps = buildDeps({ sessionRepo });

    const result = await revokeSession(deps, { sessionId: session.id });
    expect(result).toEqual({ ok: true, value: undefined });

    const saved = await sessionRepo.findById(session.id);
    expect(saved?.revokedAt).toEqual(earlierRevocation); // unchanged, not bumped to `now`
  });
});
