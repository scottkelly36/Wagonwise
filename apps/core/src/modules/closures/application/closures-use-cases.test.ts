import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { err, ok } from '../../../shared/result.js';
import type { Closure, ClosureSourceUnavailable } from '../domain/closure.js';
import type { ClosureSource } from './closure-source.js';
import { findClosuresAlongRoute } from './find-closures-along-route.js';
import { findNearbyClosures } from './find-nearby-closures.js';
import { refreshClosures } from './refresh-closures.js';
import { closure } from './testing/closure-fixtures.js';
import { InMemoryClosureRepository } from './testing/in-memory-closure-repository.js';

const NOW = '2026-11-01T20:00:00.000Z';

class FakeSource implements ClosureSource {
  enabled = true;
  calls = 0;
  constructor(public answer: readonly Closure[] | ClosureSourceUnavailable) {}

  fetchClosures() {
    this.calls += 1;
    return Promise.resolve(
      Array.isArray(this.answer) ? ok(this.answer) : err(this.answer as ClosureSourceUnavailable),
    );
  }
}

const down: ClosureSourceUnavailable = {
  tag: 'ClosureSourceUnavailable',
  reason: 'http_error',
  status: 503,
};

describe('refreshClosures', () => {
  it('replaces the stored copy with what was fetched, and says when', async () => {
    const repo = new InMemoryClosureRepository();
    const clock = new FakeClock(NOW);
    const source = new FakeSource([closure({ id: 'a' }), closure({ id: 'b' })]);

    const result = await refreshClosures({ source, repo, clock });
    expect(result).toEqual({ ok: true, value: { closures: 2, refreshedAt: new Date(NOW) } });
    expect(repo.closures.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('leaves the last good copy in place when the fetch fails', async () => {
    const repo = new InMemoryClosureRepository();
    repo.closures = [closure({ id: 'old' })];
    const result = await refreshClosures({
      source: new FakeSource(down),
      repo,
      clock: new FakeClock(NOW),
    });
    expect(result).toEqual({ ok: false, error: down });
    expect(repo.closures.map((c) => c.id)).toEqual(['old']);
    expect(repo.replaceCalls).toBe(0);
  });

  it('refuses an empty answer when plenty is stored, but accepts one when little is', async () => {
    const lots = new InMemoryClosureRepository();
    lots.closures = Array.from({ length: 12 }, (_, i) => closure({ id: `c${i}` }));
    expect(
      await refreshClosures({ source: new FakeSource([]), repo: lots, clock: new FakeClock(NOW) }),
    ).toEqual({ ok: false, error: { tag: 'SnapshotEmpty', stored: 12 } });
    expect(lots.closures).toHaveLength(12);

    const few = new InMemoryClosureRepository();
    few.closures = [closure({ id: 'x' })];
    expect(
      (await refreshClosures({ source: new FakeSource([]), repo: few, clock: new FakeClock(NOW) }))
        .ok,
    ).toBe(true);
    expect(few.closures).toEqual([]);
  });

  it('accepts a much smaller non-empty answer: closures do end', async () => {
    const repo = new InMemoryClosureRepository();
    repo.closures = Array.from({ length: 50 }, (_, i) => closure({ id: `c${i}` }));
    const result = await refreshClosures({
      source: new FakeSource([closure({ id: 'only' })]),
      repo,
      clock: new FakeClock(NOW),
    });
    expect(result.ok).toBe(true);
    expect(repo.closures).toHaveLength(1);
  });
});

describe('findNearbyClosures', () => {
  const deps = (closures: readonly Closure[]) => {
    const repo = new InMemoryClosureRepository();
    repo.closures = closures;
    repo.refreshedAt = new Date('2026-11-01T19:55:00.000Z');
    return { repo, clock: new FakeClock(NOW) };
  };
  const here = { lat: 53.36, lon: -2.3 };

  it('finds closures in force or starting soon, those in force first', async () => {
    const found = await findNearbyClosures(
      deps([
        closure({
          id: 'tomorrow',
          startsAt: new Date('2026-11-02T22:00:00.000Z'),
          endsAt: new Date('2026-11-03T06:00:00.000Z'),
        }),
        closure({
          id: 'now',
          status: 'active',
          startsAt: new Date('2026-11-01T19:00:00.000Z'),
          endsAt: new Date('2026-11-02T06:00:00.000Z'),
        }),
        closure({
          id: 'tonight',
          startsAt: new Date('2026-11-01T22:00:00.000Z'),
          endsAt: new Date('2026-11-02T06:00:00.000Z'),
        }),
      ]),
      { centre: here, radiusM: 5000, withinDays: 7, limit: 50 },
    );
    expect(found.closures.map((c) => c.closure.id)).toEqual(['now', 'tonight', 'tomorrow']);
    expect(found.refreshedAt).toEqual(new Date('2026-11-01T19:55:00.000Z'));
  });

  it('leaves out what is over, what is paused, what starts too far ahead and what is too far away', async () => {
    const found = await findNearbyClosures(
      deps([
        closure({
          id: 'over',
          startsAt: new Date('2026-11-01T01:00:00.000Z'),
          endsAt: new Date('2026-11-01T06:00:00.000Z'),
        }),
        closure({ id: 'paused', status: 'suspended' }),
        closure({
          id: 'later',
          startsAt: new Date('2026-12-25T22:00:00.000Z'),
          endsAt: new Date('2026-12-26T06:00:00.000Z'),
        }),
        closure({
          id: 'far',
          position: { lat: 55, lon: -3 },
          lines: [
            [
              { lat: 55, lon: -3 },
              { lat: 55.01, lon: -3.01 },
            ],
          ],
        }),
        closure({ id: 'kept' }),
      ]),
      { centre: here, radiusM: 5000, withinDays: 7, limit: 50 },
    );
    expect(found.closures.map((c) => c.closure.id)).toEqual(['kept']);
  });

  it('stops at the limit', async () => {
    const found = await findNearbyClosures(
      deps(Array.from({ length: 5 }, (_, i) => closure({ id: `c${i}` }))),
      { centre: here, radiusM: 5000, withinDays: 7, limit: 2 },
    );
    expect(found.closures).toHaveLength(2);
  });
});

describe('findClosuresAlongRoute', () => {
  const route = [
    { lat: 53.35, lon: -2.31 },
    { lat: 53.37, lon: -2.29 },
  ];
  const deps = (closures: readonly Closure[]) => {
    const repo = new InMemoryClosureRepository();
    repo.closures = closures;
    return { repo, clock: new FakeClock(NOW) };
  };

  it('finds closures along the route that are in force now or start within the look-ahead', async () => {
    const found = await findClosuresAlongRoute(
      deps([
        closure({ id: 'tonight' }),
        closure({
          id: 'beyond',
          startsAt: new Date('2026-11-04T22:00:00.000Z'),
          endsAt: new Date('2026-11-05T06:00:00.000Z'),
        }),
      ]),
      { corridor: route, withinHours: 48, limit: 100 },
    );
    expect(found.closures.map((c) => c.id)).toEqual(['tonight']);
  });

  it('counts the look-ahead from now', async () => {
    const found = await findClosuresAlongRoute(
      deps([
        closure({
          id: 'beyond',
          startsAt: new Date('2026-11-04T22:00:00.000Z'),
          endsAt: new Date('2026-11-05T06:00:00.000Z'),
        }),
      ]),
      { corridor: route, withinHours: 75, limit: 100 },
    );
    expect(found.closures.map((c) => c.id)).toEqual(['beyond']);
  });
});
