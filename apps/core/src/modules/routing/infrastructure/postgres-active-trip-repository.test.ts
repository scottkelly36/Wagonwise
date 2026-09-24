import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { ActiveTrip } from '../domain/active-trip.js';
import type { RoutePlan } from '../domain/route-plan.js';
import type { UntypedDb } from './db.js';
import { PostgresActiveTripRepository } from './postgres-active-trip-repository.js';
import { PostgresRoutePlanRepository } from './postgres-route-plan-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresActiveTripRepository', () => {
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

  const repo = () => new PostgresActiveTripRepository(db);

  function trip(overrides: Partial<ActiveTrip> = {}): ActiveTrip {
    return {
      id: makeId<'ActiveTripId'>('11111111-1111-4111-8111-111111111111'),
      routePlanId: makeId<'RoutePlanId'>('22222222-2222-4222-8222-222222222222'),
      driverId: makeId<'DriverId'>('33333333-3333-4333-8333-333333333333'),
      startedAt: new Date('2026-06-15T08:00:00.000Z'),
      ...overrides,
    };
  }

  it('round-trips a freshly started trip through save/findById', async () => {
    const t = trip();
    await repo().save(t);
    expect(await repo().findById(t.id)).toEqual(t);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await repo().findById(makeId<'ActiveTripId'>('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });

  it('findActiveForDriver finds an unended trip and ignores ended ones', async () => {
    const driverId = makeId<'DriverId'>('44444444-4444-4444-8444-444444444444');
    expect(await repo().findActiveForDriver(driverId)).toBeNull();

    const t = trip({
      id: makeId<'ActiveTripId'>('55555555-5555-4555-8555-555555555555'),
      driverId,
    });
    await repo().save(t);
    expect(await repo().findActiveForDriver(driverId)).toEqual(t);

    const ended = { ...t, endedAt: new Date('2026-06-15T09:00:00.000Z') };
    await repo().save(ended);
    expect(await repo().findActiveForDriver(driverId)).toBeNull();
    expect(await repo().findById(t.id)).toEqual(ended);
  });

  it('rejects a second concurrent active trip for the same driver (unique index)', async () => {
    const driverId = makeId<'DriverId'>('66666666-6666-4666-8666-666666666666');
    await repo().save(
      trip({ id: makeId<'ActiveTripId'>('77777777-7777-4777-8777-777777777777'), driverId }),
    );
    await expect(
      repo().save(
        trip({ id: makeId<'ActiveTripId'>('88888888-8888-4888-8888-888888888888'), driverId }),
      ),
    ).rejects.toThrow();
  });

  describe('findActiveNear (M6.4)', () => {
    // Same test-only encoder as postgres-route-plan-repository.test.ts — kept local rather than
    // shared, since it exists purely to build realistic fixtures for these two spatial-query
    // suites and isn't part of any production import graph.
    function encodeValue(raw: number): string {
      let value = raw < 0 ? ~(raw << 1) : raw << 1;
      let output = '';
      while (value >= 0x20) {
        output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
      }
      return output + String.fromCharCode(value + 63);
    }
    function encodePolyline(points: { lat: number; lon: number }[]): string {
      const factor = 10 ** 6;
      let output = '';
      let prevLat = 0;
      let prevLon = 0;
      for (const { lat, lon } of points) {
        const lat5 = Math.round(lat * factor);
        const lon5 = Math.round(lon * factor);
        output += encodeValue(lat5 - prevLat) + encodeValue(lon5 - prevLon);
        prevLat = lat5;
        prevLon = lon5;
      }
      return output;
    }

    const routeGeometry = encodePolyline([
      { lat: 54.9707, lon: -2.1013 },
      { lat: 54.972, lon: -2.099 },
      { lat: 54.9738, lon: -2.0165 },
    ]);
    const onRoute = { lat: 54.972, lon: -2.099 };
    const farAway = { lat: 55.5, lon: -1.5 };

    const planRepo = () => new PostgresRoutePlanRepository(db);

    function plan(overrides: Partial<RoutePlan> = {}): RoutePlan {
      return {
        id: makeId<'RoutePlanId'>('99999999-9999-4999-8999-999999999999'),
        driverId: makeId<'DriverId'>('11111111-1111-4111-8111-111111111111'),
        profileId: makeId<'VehicleProfileId'>('12121212-1212-4121-8121-121212121212'),
        origin: { lat: 54.9707, lon: -2.1013 },
        destination: { lat: 54.9738, lon: -2.0165 },
        geometry: routeGeometry,
        distanceKm: 8.038,
        durationMin: 7.9,
        avoidedRestrictions: [],
        hazardsOnRoute: [],
        createdAt: new Date('2026-06-15T08:00:00.000Z'),
        ...overrides,
      };
    }

    it("finds an unended trip whose plan's route passes near the location", async () => {
      const p = plan({ id: makeId<'RoutePlanId'>('13131313-1313-4131-8131-131313131313') });
      await planRepo().save(p);
      const t = trip({
        id: makeId<'ActiveTripId'>('14141414-1414-4141-8141-141414141414'),
        driverId: makeId<'DriverId'>('14141414-aaaa-4141-8141-141414141414'),
        routePlanId: p.id,
      });
      await repo().save(t);

      const found = await repo().findActiveNear(onRoute, 30);
      expect(found.map((r) => r.id)).toContain(t.id);
    });

    it('excludes a trip whose plan route is nowhere near the location', async () => {
      const p = plan({ id: makeId<'RoutePlanId'>('15151515-1515-4151-8151-151515151515') });
      await planRepo().save(p);
      const t = trip({
        id: makeId<'ActiveTripId'>('16161616-1616-4161-8161-161616161616'),
        driverId: makeId<'DriverId'>('16161616-aaaa-4161-8161-161616161616'),
        routePlanId: p.id,
      });
      await repo().save(t);

      const found = await repo().findActiveNear(farAway, 30);
      expect(found.map((r) => r.id)).not.toContain(t.id);
    });

    it('excludes an already-ended trip even if its plan route is near the location', async () => {
      const p = plan({ id: makeId<'RoutePlanId'>('17171717-1717-4171-8171-171717171717') });
      await planRepo().save(p);
      const t = trip({
        id: makeId<'ActiveTripId'>('18181818-1818-4181-8181-181818181818'),
        routePlanId: p.id,
        endedAt: new Date('2026-06-15T09:00:00.000Z'),
      });
      await repo().save(t);

      const found = await repo().findActiveNear(onRoute, 30);
      expect(found.map((r) => r.id)).not.toContain(t.id);
    });
  });
});
