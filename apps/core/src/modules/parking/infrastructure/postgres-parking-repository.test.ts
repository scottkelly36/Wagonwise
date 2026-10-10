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
      expect(found).toMatchObject([s]);
    });

    it('round-trips a spot with no note', async () => {
      const s = spot({
        id: makeId<'SafeParkingSpotId'>('88888888-8888-4888-8888-888888888888'),
        location: { lat: 51.5074, lon: -0.1278 },
        note: undefined,
      });
      await repo().save(s);

      const found = await repo().findNearbyLine([s.location], 50);
      expect(found).toMatchObject([s]);
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

  describe('kind', () => {
    it('is a parking spot unless it says it is a lay-by, and can be changed by staff', async () => {
      const plain = spot({
        id: makeId<'SafeParkingSpotId'>('eeeeeeee-eeee-4eee-8eee-000000000001'),
        location: { lat: 53.1, lon: -2.1 },
      });
      const layby = spot({
        id: makeId<'SafeParkingSpotId'>('eeeeeeee-eeee-4eee-8eee-000000000002'),
        location: { lat: 53.2, lon: -2.2 },
        reporterId: undefined,
        source: 'osm',
        osmId: 'node/77',
        kind: 'layby',
      });
      await repo().save(plain);
      await repo().save(layby);
      expect((await repo().find(plain.id))?.kind).toBe('parking');
      expect((await repo().find(layby.id))?.kind).toBe('layby');
      await repo().update({ ...layby, kind: 'parking' });
      expect((await repo().find(layby.id))?.kind).toBe('parking');
    });
  });

  describe('reports, merging and undo', () => {
    const sid = (n: number) =>
      makeId<'SafeParkingSpotId'>(`bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`);
    const driver = (n: number) =>
      makeId<'DriverId'>(`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`);
    const place = { lat: 52.1, lon: -1.1 };
    const t = (hours: number) => new Date(Date.UTC(2026, 9, 10, hours));

    it('finds the nearest spot within the radius, whatever its source, and none beyond it', async () => {
      const near = spot({
        id: sid(1),
        location: place,
        reporterId: driver(1),
        reportedAt: t(8),
        lastReportedAt: t(8),
      });
      await repo().save(near);
      const osm = spot({
        id: sid(2),
        location: { lat: 52.1002, lon: -1.1 },
        reporterId: undefined,
        source: 'osm',
        osmId: 'node/9',
      });
      await repo().save(osm);
      expect((await repo().findNearest({ lat: 52.10019, lon: -1.1 }, 30))?.id).toBe(osm.id);
      expect((await repo().findNearest({ lat: 52.1, lon: -1.1 }, 30))?.id).toBe(near.id);
      expect(await repo().findNearest({ lat: 52.2, lon: -1.1 }, 30)).toBeNull();
    });

    it('adds a second driver’s report to the spot, keeps both notes, and the latest wins', async () => {
      const first = spot({
        id: sid(10),
        location: { lat: 52.3, lon: -1.3 },
        reporterId: driver(1),
        note: 'flat layby',
        reportedAt: t(8),
        lastReportedAt: t(8),
      });
      await repo().save(first);
      const added = await repo().addReport({
        id: 'dddddddd-dddd-4ddd-8ddd-000000000010',
        spotId: first.id,
        reporterId: driver(2),
        note: 'now full of cones',
        reportedAt: t(10),
      });
      expect(added).toBe(true);
      // The same report again changes nothing.
      expect(
        await repo().addReport({
          id: 'dddddddd-dddd-4ddd-8ddd-000000000010',
          spotId: first.id,
          reporterId: driver(2),
          note: 'now full of cones',
          reportedAt: t(10),
        }),
      ).toBe(false);
      const merged = await repo().find(first.id);
      expect(merged).toMatchObject({ note: 'now full of cones', reporterCount: 2 });
      expect(merged?.lastReportedAt).toEqual(t(10));
      expect(merged?.recentNotes).toEqual(['now full of cones', 'flat layby']);
    });

    it('counts a driver once however often they report, and keeps a staff spot’s own note', async () => {
      const staff = spot({
        id: sid(20),
        location: { lat: 52.4, lon: -1.4 },
        reporterId: undefined,
        source: 'admin',
        note: 'Behind the services',
        reportedAt: t(7),
        lastReportedAt: t(7),
      });
      await repo().save(staff);
      for (const n of [1, 2]) {
        await repo().addReport({
          id: `dddddddd-dddd-4ddd-8ddd-0000000000${20 + n}`,
          spotId: staff.id,
          reporterId: driver(5),
          note: `visit ${n}`,
          reportedAt: t(8 + n),
        });
      }
      const found = await repo().find(staff.id);
      expect(found).toMatchObject({ note: 'Behind the services', reporterCount: 1 });
      expect(found?.recentNotes).toEqual(['visit 2', 'visit 1']);
    });

    it('undo removes only that report: the spot stays while another driver has vouched, and goes with the last', async () => {
      const mine = spot({
        id: sid(30),
        location: { lat: 52.5, lon: -1.5 },
        reporterId: driver(1),
        note: 'first',
        reportedAt: t(8),
        lastReportedAt: t(8),
      });
      await repo().save(mine);
      await repo().addReport({
        id: 'dddddddd-dddd-4ddd-8ddd-000000000030',
        spotId: mine.id,
        reporterId: driver(2),
        note: 'second',
        reportedAt: t(9),
      });
      // Someone else's report cannot be undone by a stranger.
      expect(await repo().removeReport('dddddddd-dddd-4ddd-8ddd-000000000030', driver(1))).toBe(
        false,
      );
      expect(await repo().removeReport('dddddddd-dddd-4ddd-8ddd-000000000030', driver(2))).toBe(
        true,
      );
      const after = await repo().find(mine.id);
      expect(after).toMatchObject({ note: 'first', reporterCount: 1 });
      expect(after?.lastReportedAt).toEqual(t(8));
      // The first driver takes back theirs (the report has the spot's id): nobody is left, so the spot goes.
      expect(await repo().removeReport(mine.id, driver(1))).toBe(true);
      expect(await repo().find(mine.id)).toBeNull();
      expect(await repo().removeReport(mine.id, driver(1))).toBe(false);
    });

    it('makes a lay-by a parking spot once a driver vouches for it', async () => {
      const layby = spot({
        id: sid(50),
        location: { lat: 52.7, lon: -1.7 },
        reporterId: undefined,
        source: 'osm',
        osmId: 'node/50',
        kind: 'layby',
        reportedAt: t(1),
        lastReportedAt: t(1),
      });
      await repo().save(layby);
      await repo().addReport({
        id: 'dddddddd-dddd-4ddd-8ddd-000000000050',
        spotId: layby.id,
        reporterId: driver(4),
        note: 'room for two',
        reportedAt: t(9),
      });
      expect((await repo().find(layby.id))?.kind).toBe('parking');
    });

    it('never removes a staff or imported spot when its last driver report is undone', async () => {
      const osm = spot({
        id: sid(40),
        location: { lat: 52.6, lon: -1.6 },
        reporterId: undefined,
        source: 'osm',
        osmId: 'node/40',
        note: 'Service area',
        reportedAt: t(1),
        lastReportedAt: t(1),
      });
      await repo().save(osm);
      await repo().addReport({
        id: 'dddddddd-dddd-4ddd-8ddd-000000000040',
        spotId: osm.id,
        reporterId: driver(3),
        note: 'busy',
        reportedAt: t(9),
      });
      expect(await repo().removeReport('dddddddd-dddd-4ddd-8ddd-000000000040', driver(3))).toBe(
        true,
      );
      const after = await repo().find(osm.id);
      expect(after).toMatchObject({ source: 'osm', note: 'Service area', reporterCount: 0 });
      expect(after?.lastReportedAt).toEqual(t(1));
    });
  });
});
