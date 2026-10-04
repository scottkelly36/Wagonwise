import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { RoutePlan } from '../domain/route-plan.js';
import type { UntypedDb } from './db.js';
import { PostgresRoutePlanRepository } from './postgres-route-plan-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresRoutePlanRepository', () => {
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

  const repo = () => new PostgresRoutePlanRepository(db);

  function plan(overrides: Partial<RoutePlan> = {}): RoutePlan {
    return {
      id: makeId<'RoutePlanId'>('11111111-1111-4111-8111-111111111111'),
      driverId: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
      profileId: makeId<'VehicleProfileId'>('33333333-3333-4333-8333-333333333333'),
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
      geometry: 'encoded-polyline',
      distanceKm: 8.038,
      durationMin: 7.9,
      avoidedRestrictions: [],
      maneuvers: [],
      hazardsOnRoute: [],
      createdAt: new Date('2026-06-15T08:00:00.000Z'),
      ...overrides,
    };
  }

  it('round-trips a plan with empty avoidedRestrictions/hazardsOnRoute through save/findById', async () => {
    const p = plan();
    await repo().save(p);
    expect(await repo().findById(p.id)).toEqual(p);
  });

  it('round-trips non-empty avoidedRestrictions and hazardsOnRoute (jsonb columns)', async () => {
    const p = plan({
      id: makeId<'RoutePlanId'>('44444444-4444-4444-8444-444444444444'),
      avoidedRestrictions: [{ description: 'Avoided Styford Bridge — 3.7m limit' }],
      hazardsOnRoute: ['hazard-1', 'hazard-2'],
    });
    await repo().save(p);
    expect(await repo().findById(p.id)).toEqual(p);
  });

  it('round-trips turn-by-turn steps, including a roundabout exit (P2-M10)', async () => {
    const p = plan({
      id: makeId<'RoutePlanId'>('c0de0001-0000-4000-8000-000000000001'),
      maneuvers: [
        {
          kind: 'left',
          text: 'Turn left onto Hencotes (B6305).',
          speech: 'Turn left onto Hencotes, B6305.',
          streetNames: ['Hencotes', 'B6305'],
          lengthM: 259,
          beginShapeIndex: 6,
        },
        {
          kind: 'roundabout',
          text: 'Enter the roundabout and take the 3rd exit onto A6079.',
          speech: 'Enter the roundabout and take the 3rd exit onto A6079.',
          streetNames: [],
          lengthM: 23,
          beginShapeIndex: 87,
          roundaboutExit: 3,
        },
      ],
    });
    await repo().save(p);
    expect(await repo().findById(p.id)).toEqual(p);
  });

  it('reads a plan made before turn-by-turn existed as having no steps', async () => {
    const id = 'c0de0002-0000-4000-8000-000000000002';
    // The column's default is what every earlier row has: insert without naming it.
    await pool.query(
      `insert into routing.route_plans
         (id, driver_id, profile_id, origin_lat, origin_lon, destination_lat, destination_lon,
          geometry, distance_km, duration_min, created_at)
       values ($1, $2, $3, 54.9, -2.1, 54.97, -2.0, 'x', 1, 1, now())`,
      [id, '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
    );
    expect((await repo().findById(makeId<'RoutePlanId'>(id)))?.maneuvers).toEqual([]);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await repo().findById(makeId<'RoutePlanId'>('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });

  describe('findRecentUnstartedNear (M6.4)', () => {
    // A short, real polyline6-encoded line through Hexham — the shipped decoder
    // (routing/domain/geo.ts) is never re-tested here, only exercised for real; this encoder is
    // its inverse, kept test-only, the same "encoder lives only in the test file" split
    // polyline.test.ts (driver-app) already established for the same reason.
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

    // Runs along Hexham's Beaumont Street, roughly — real coordinates, not placeholders.
    const routeGeometry = encodePolyline([
      { lat: 54.9707, lon: -2.1013 },
      { lat: 54.972, lon: -2.099 },
      { lat: 54.9738, lon: -2.0165 },
    ]);
    const onRoute = { lat: 54.972, lon: -2.099 }; // one of the route's own points
    const farAway = { lat: 55.5, lon: -1.5 }; // nowhere near Hexham

    it('finds a recent plan with no trip whose route passes near the location', async () => {
      const p = plan({
        id: makeId<'RoutePlanId'>('55555555-5555-4555-8555-555555555555'),
        geometry: routeGeometry,
        createdAt: new Date('2026-06-15T08:00:00.000Z'),
      });
      await repo().save(p);

      const found = await repo().findRecentUnstartedNear(
        onRoute,
        30,
        new Date('2026-06-15T07:00:00.000Z'),
      );
      expect(found.map((r) => r.id)).toContain(p.id);
    });

    it('excludes a plan whose route is nowhere near the location', async () => {
      const p = plan({
        id: makeId<'RoutePlanId'>('66666666-6666-4666-8666-666666666666'),
        geometry: routeGeometry,
        createdAt: new Date('2026-06-15T08:00:00.000Z'),
      });
      await repo().save(p);

      const found = await repo().findRecentUnstartedNear(
        farAway,
        30,
        new Date('2026-06-15T07:00:00.000Z'),
      );
      expect(found.map((r) => r.id)).not.toContain(p.id);
    });

    it('excludes a plan created before the cutoff', async () => {
      const p = plan({
        id: makeId<'RoutePlanId'>('77777777-7777-4777-8777-777777777777'),
        geometry: routeGeometry,
        createdAt: new Date('2026-06-15T01:00:00.000Z'), // 7h before the cutoff below
      });
      await repo().save(p);

      const found = await repo().findRecentUnstartedNear(
        onRoute,
        30,
        new Date('2026-06-15T07:00:00.000Z'), // "since" — plan is older than this
      );
      expect(found.map((r) => r.id)).not.toContain(p.id);
    });

    it('excludes a plan that already has a trip, even a since-ended one', async () => {
      const p = plan({
        id: makeId<'RoutePlanId'>('88888888-8888-4888-8888-888888888888'),
        geometry: routeGeometry,
        createdAt: new Date('2026-06-15T08:00:00.000Z'),
      });
      await repo().save(p);
      await pool.query(
        `insert into routing.active_trips (id, route_plan_id, driver_id, started_at, ended_at)
         values ($1, $2, $3, now(), now())`,
        ['99999999-9999-4999-8999-999999999999', p.id, p.driverId],
      );

      const found = await repo().findRecentUnstartedNear(
        onRoute,
        30,
        new Date('2026-06-15T07:00:00.000Z'),
      );
      expect(found.map((r) => r.id)).not.toContain(p.id);
    });

    it('never matches a plan with fewer than two decoded points (geometry_geog stays null)', async () => {
      const p = plan({
        id: makeId<'RoutePlanId'>('10101010-1010-4101-8101-101010101010'),
        geometry: 'x', // decodes to a single garbage point — see save()'s own guard
        createdAt: new Date('2026-06-15T08:00:00.000Z'),
      });
      await repo().save(p);

      const found = await repo().findRecentUnstartedNear(
        onRoute,
        1_000_000, // huge radius — would match almost anything if geog were somehow set
        new Date('2026-06-15T07:00:00.000Z'),
      );
      expect(found.map((r) => r.id)).not.toContain(p.id);
    });
  });
});
