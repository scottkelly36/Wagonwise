import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closure } from '../application/testing/closure-fixtures.js';
import type { ClosuresAlongRouteQuery, NearbyClosuresQuery } from '../domain/closure.js';
import type { UntypedDb } from './db.js';
import { PostgresClosureRepository } from './postgres-closure-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const NOW = new Date('2026-11-01T20:00:00.000Z');
const REFRESHED = new Date('2026-11-01T19:55:00.000Z');

const query = (overrides: Partial<NearbyClosuresQuery> = {}): NearbyClosuresQuery => ({
  centre: { lat: 53.36, lon: -2.3 },
  radiusM: 5000,
  now: NOW,
  startsBefore: new Date('2026-11-08T20:00:00.000Z'),
  limit: 50,
  ...overrides,
});

describe('PostgresClosureRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;
  let repo: PostgresClosureRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
    repo = new PostgresClosureRepository(db);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await pool.query('delete from closures.closures');
    await pool.query('delete from closures.refreshes');
  });

  it('has nothing, and no refresh time, before the first refresh', async () => {
    expect(await repo.counts()).toEqual({ closures: 0, refreshedAt: undefined });
    expect(await repo.findNearby(query())).toEqual({ closures: [], refreshedAt: undefined });
  });

  it('stores a closure and reads back everything about it, lines and all', async () => {
    const stored = closure({
      id: 'a',
      status: 'active',
      lanesClosed: 2,
      lines: [
        [
          { lat: 53.35, lon: -2.31 },
          { lat: 53.36, lon: -2.3 },
        ],
        [
          { lat: 53.4, lon: -2.4 },
          { lat: 53.41, lon: -2.41 },
        ],
      ],
    });
    await repo.replaceAll([stored], REFRESHED);

    const found = await repo.findNearby(query());
    expect(found.refreshedAt).toEqual(REFRESHED);
    expect(found.closures).toHaveLength(1);
    const first = found.closures[0];
    expect(first?.closure).toEqual(stored);
    // The line passes through the centre's own latitude and longitude, so it is not far.
    expect(first?.distanceM).toBeLessThan(5);
  });

  it('replaces the whole copy, so a closure that has gone from the feed has gone from here', async () => {
    await repo.replaceAll([closure({ id: 'a' }), closure({ id: 'b' })], REFRESHED);
    await repo.replaceAll([closure({ id: 'b' }), closure({ id: 'c' })], NOW);
    const found = await repo.findNearby(query());
    expect(found.closures.map((c) => c.closure.id).sort()).toEqual(['b', 'c']);
    expect(await repo.counts()).toEqual({ closures: 2, refreshedAt: NOW });
  });

  it('copes with the feed listing the same record twice', async () => {
    await repo.replaceAll(
      [closure({ id: 'a' }), closure({ id: 'a', description: 'again' })],
      REFRESHED,
    );
    expect((await repo.counts()).closures).toBe(1);
  });

  it('finds by the closure line, not just its marker: a long closure is near anyone along it', async () => {
    // A line about 11 km long; the marker is the middle vertex, but a driver at the far end is within 2 km of the line itself.
    await repo.replaceAll(
      [
        closure({
          id: 'long',
          position: { lat: 53.4, lon: -2.3 },
          lines: [
            [
              { lat: 53.3, lon: -2.3 },
              { lat: 53.4, lon: -2.3 },
            ],
          ],
        }),
      ],
      REFRESHED,
    );
    const nearEnd = await repo.findNearby(
      query({ centre: { lat: 53.302, lon: -2.3 }, radiusM: 2000 }),
    );
    expect(nearEnd.closures.map((c) => c.closure.id)).toEqual(['long']);
    const away = await repo.findNearby(query({ centre: { lat: 53.2, lon: -2.3 }, radiusM: 2000 }));
    expect(away.closures).toEqual([]);
  });

  it('leaves out closures that are paused, over, too far ahead or too far away', async () => {
    await repo.replaceAll(
      [
        closure({ id: 'kept' }),
        closure({ id: 'paused', status: 'suspended' }),
        closure({
          id: 'over',
          startsAt: new Date('2026-11-01T01:00:00.000Z'),
          endsAt: new Date('2026-11-01T06:00:00.000Z'),
        }),
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
      ],
      REFRESHED,
    );
    const found = await repo.findNearby(query());
    expect(found.closures.map((c) => c.closure.id)).toEqual(['kept']);
  });

  it('orders closures in force first, then the soonest to start, and stops at the limit', async () => {
    await repo.replaceAll(
      [
        closure({
          id: 'tomorrow',
          startsAt: new Date('2026-11-02T22:00:00.000Z'),
          endsAt: new Date('2026-11-03T06:00:00.000Z'),
        }),
        closure({ id: 'tonight', startsAt: new Date('2026-11-01T22:00:00.000Z') }),
        closure({ id: 'now', status: 'active', startsAt: new Date('2026-11-01T19:00:00.000Z') }),
      ],
      REFRESHED,
    );
    expect((await repo.findNearby(query())).closures.map((c) => c.closure.id)).toEqual([
      'now',
      'tonight',
      'tomorrow',
    ]);
    expect((await repo.findNearby(query({ limit: 2 }))).closures.map((c) => c.closure.id)).toEqual([
      'now',
      'tonight',
    ]);
  });
  describe('findAlongRoute', () => {
    const along = (overrides: Partial<ClosuresAlongRouteQuery> = {}): ClosuresAlongRouteQuery => ({
      // The fixture closure's own line, as a route that runs along it.
      corridor: [
        { lat: 53.35, lon: -2.31 },
        { lat: 53.36, lon: -2.3 },
        { lat: 53.37, lon: -2.29 },
      ],
      now: NOW,
      startsBefore: new Date('2026-11-03T20:00:00.000Z'),
      limit: 100,
      ...overrides,
    });

    it('finds a closure whose line the route runs along, with its lines, and says when the copy was made', async () => {
      await repo.replaceAll([closure({ id: 'on-route' })], REFRESHED);
      const found = await repo.findAlongRoute(along());
      expect(found.refreshedAt).toEqual(REFRESHED);
      expect(found.closures).toHaveLength(1);
      expect(found.closures[0]).toMatchObject({
        id: 'on-route',
        lines: [
          [
            { lat: 53.35, lon: -2.31 },
            { lat: 53.36, lon: -2.3 },
            { lat: 53.37, lon: -2.29 },
          ],
        ],
      });
    });

    it('keeps a closure about 30 m to the side (the other carriageway is left to the app) and drops one 500 m away', async () => {
      await repo.replaceAll([closure({ id: 'beside' })], REFRESHED);
      // 0.0004 degrees of longitude is about 27 m at this latitude.
      const beside = along({
        corridor: [
          { lat: 53.35, lon: -2.3104 },
          { lat: 53.37, lon: -2.2904 },
        ],
      });
      expect((await repo.findAlongRoute(beside)).closures.map((c) => c.id)).toEqual(['beside']);
      const away = along({
        corridor: [
          { lat: 53.35, lon: -2.318 },
          { lat: 53.37, lon: -2.298 },
        ],
      });
      expect((await repo.findAlongRoute(away)).closures).toEqual([]);
    });

    it('takes a route of one point, and leaves out paused, ended and too-distant closures', async () => {
      await repo.replaceAll(
        [
          closure({ id: 'tonight' }),
          closure({ id: 'paused', status: 'suspended' }),
          closure({
            id: 'ended',
            startsAt: new Date('2026-11-01T01:00:00.000Z'),
            endsAt: new Date('2026-11-01T05:00:00.000Z'),
          }),
          closure({
            id: 'next-week',
            startsAt: new Date('2026-11-09T22:00:00.000Z'),
            endsAt: new Date('2026-11-10T06:00:00.000Z'),
          }),
        ],
        REFRESHED,
      );
      const found = await repo.findAlongRoute(along({ corridor: [{ lat: 53.36, lon: -2.3 }] }));
      expect(found.closures.map((c) => c.id)).toEqual(['tonight']);
    });

    it('orders those in force first, then the soonest to start, and stops at the limit', async () => {
      await repo.replaceAll(
        [
          closure({
            id: 'tomorrow',
            startsAt: new Date('2026-11-02T22:00:00.000Z'),
            endsAt: new Date('2026-11-03T06:00:00.000Z'),
          }),
          closure({ id: 'tonight' }),
          closure({ id: 'now', status: 'active', startsAt: new Date('2026-11-01T19:00:00.000Z') }),
        ],
        REFRESHED,
      );
      expect((await repo.findAlongRoute(along())).closures.map((c) => c.id)).toEqual([
        'now',
        'tonight',
        'tomorrow',
      ]);
      expect((await repo.findAlongRoute(along({ limit: 2 }))).closures.map((c) => c.id)).toEqual([
        'now',
        'tonight',
      ]);
    });
  });
});
