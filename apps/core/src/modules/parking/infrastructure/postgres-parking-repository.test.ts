import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { DriverId, SafeParkingSpot } from '../domain/safe-parking-spot.js';
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
    // The starting set imported by migration 0061 would otherwise be in the way of these tests.
    await pool.query('delete from parking.safe_parking_spots');
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
      source: 'driver',
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

  describe('details and staff changes', () => {
    const at = { lat: 50.1, lon: -3.1 };
    const id = (n: number) =>
      makeId<'SafeParkingSpotId'>(`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`);

    it('round-trips the name, capacity and facilities, and keeps unknown apart from no', async () => {
      const s = spot({
        id: id(1),
        location: at,
        reporterId: undefined,
        source: 'admin',
        name: 'Exeter Truckstop',
        capacity: 40,
        paid: true,
        toilets: true,
        showers: false,
      });
      await repo().save(s);
      const found = await repo().find(s.id);
      expect(found).toMatchObject({
        source: 'admin',
        name: 'Exeter Truckstop',
        capacity: 40,
        paid: true,
        toilets: true,
        showers: false,
      });
      expect(found?.reporterId).toBeUndefined();
      expect(found?.shop).toBeUndefined();
    });

    it('searches by words in the name or note and by source, and counts each source', async () => {
      await repo().save(
        spot({
          id: id(2),
          location: { lat: 50.2, lon: -3.2 },
          note: 'Quiet LAYBY',
          source: 'driver',
        }),
      );
      await repo().save(
        spot({
          id: id(3),
          location: { lat: 50.3, lon: -3.3 },
          reporterId: undefined,
          source: 'osm',
          osmId: 'node/1',
          name: 'Layby 4',
          note: 'Lorry parking',
        }),
      );
      const quiet = await repo().search({ text: 'QUIET', limit: 10 });
      expect(quiet.spots.map((x) => x.id)).toEqual([id(2)]);
      const osm = await repo().search({ source: 'osm', limit: 10 });
      expect(osm.spots.map((x) => x.id)).toEqual([id(3)]);
      expect(await repo().search({ text: '100%', limit: 10 })).toEqual({ spots: [], total: 0 });
      const counts = await repo().countBySource();
      expect(counts.osm).toBe(1);
      expect(counts.admin).toBe(1);
      expect(counts.driver).toBeGreaterThanOrEqual(1);
    });

    it('never inserts the same imported place twice', async () => {
      const again = spot({
        id: id(4),
        location: { lat: 50.4, lon: -3.4 },
        reporterId: undefined,
        source: 'osm',
        osmId: 'node/1',
      });
      await expect(repo().save(again)).rejects.toThrow();
    });

    it('updates what staff may change, and deletes any spot', async () => {
      const original = (await repo().find(id(2))) as SafeParkingSpot;
      const changed = { ...original, name: 'Layby on the A38', toilets: true, note: undefined };
      expect(await repo().update(changed)).toBe(true);
      expect(await repo().find(id(2))).toMatchObject({
        name: 'Layby on the A38',
        toilets: true,
        source: 'driver',
      });
      expect(await repo().update({ ...original, id: id(99) })).toBe(false);
      expect(await repo().deleteAny(id(2))).toBe(true);
      expect(await repo().deleteAny(id(2))).toBe(false);
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

      expect(await repo().deleteOwned(mine.id, mine.reporterId as DriverId)).toBe(true);
      expect(await repo().findNearbyLine([mine.location], 50)).toEqual([]);
      expect(await repo().deleteOwned(mine.id, mine.reporterId as DriverId)).toBe(false);
    });
  });
});
