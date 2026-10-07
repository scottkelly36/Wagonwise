import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { SafeParkingSpot } from '../domain/safe-parking-spot.js';
import type { UntypedDb } from './db.js';
import { PostgresParkingRepository } from './postgres-parking-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresParkingRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const repo = () => new PostgresParkingRepository(db);

  function spot(overrides: Partial<SafeParkingSpot> = {}): SafeParkingSpot {
    return {
      id: makeId<'SafeParkingSpotId'>('11111111-1111-4111-8111-111111111111'),
      reporterId: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
      location: { lat: 54.9698, lon: -2.1013 },
      note: 'flat layby, room for a 44-tonner',
      reportedAt: new Date('2026-06-01T12:00:00.000Z'),
      ...overrides,
    };
  }

  describe('findNearbyLine', () => {
    it('finds a spot within the radius and excludes one outside it', async () => {
      const near = spot({
        id: makeId<'SafeParkingSpotId'>('55555555-5555-4555-8555-555555555555'),
        location: { lat: 54.975, lon: -2.105 },
      });
      const far = spot({
        id: makeId<'SafeParkingSpotId'>('66666666-6666-4666-8666-666666666666'),
        location: { lat: 55.5, lon: -1.5 },
      });
      await repo().save(near);
      await repo().save(far);

      const found = await repo().findNearbyLine([{ lat: 54.9751, lon: -2.1049 }], 50);
      expect(found.map((r) => r.id)).toEqual([near.id]);
    });

    it('returns an empty array for an empty corridor', async () => {
      expect(await repo().findNearbyLine([], 50)).toEqual([]);
    });

    it('returns an empty array when nothing is nearby', async () => {
      expect(await repo().findNearbyLine([{ lat: 10, lon: 10 }], 50)).toEqual([]);
    });
  });

  describe('save', () => {
    it('round-trips a spot, reloadable via findNearbyLine', async () => {
      const s = spot({ id: makeId<'SafeParkingSpotId'>('77777777-7777-4777-8777-777777777777') });
      await repo().save(s);

      const found = await repo().findNearbyLine([s.location], 50);
      expect(found).toEqual([s]);
    });

    it('round-trips a spot with no note', async () => {
      const s = spot({
        id: makeId<'SafeParkingSpotId'>('88888888-8888-4888-8888-888888888888'),
        location: { lat: 51.5074, lon: -0.1278 },
        note: undefined,
      });
      await repo().save(s);

      const found = await repo().findNearbyLine([s.location], 50);
      expect(found).toEqual([s]);
    });
  });

  describe('deleteOwned', () => {
    it('deletes the reporter’s own spot, and no one else’s', async () => {
      const mine = spot({
        id: makeId<'SafeParkingSpotId'>('99999999-9999-4999-8999-999999999991'),
        location: { lat: 52.1, lon: -1.1 },
      });
      await repo().save(mine);
      const stranger = makeId<'DriverId'>('33333333-3333-4333-8333-333333333333');

      expect(await repo().deleteOwned(mine.id, stranger)).toBe(false);
      expect(await repo().findNearbyLine([mine.location], 50)).toHaveLength(1);

      expect(await repo().deleteOwned(mine.id, mine.reporterId)).toBe(true);
      expect(await repo().findNearbyLine([mine.location], 50)).toEqual([]);
      expect(await repo().deleteOwned(mine.id, mine.reporterId)).toBe(false);
    });
  });
});
