import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { RoutePlan } from '../domain/route-plan.js';
import type { VehicleProfile } from '../domain/vehicle-profile.js';
import type { UntypedDb } from './db.js';
import { PostgresRoutePlanRepository } from './postgres-route-plan-repository.js';
import { PostgresRoutingHousekeeping } from './postgres-routing-housekeeping.js';
import { PostgresVehicleProfileRepository } from './postgres-vehicle-profile-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const ANNA = 'a0000000-0000-4000-8000-000000000001';
const BEN = 'b0000000-0000-4000-8000-000000000002';
const plan = (n: number) => `c000000${n}-0000-4000-8000-00000000000${n}`;
const trip = (n: number) => `d000000${n}-0000-4000-8000-00000000000${n}`;

describe('PostgresRoutingHousekeeping', () => {
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

  const housekeeping = () => new PostgresRoutingHousekeeping(db);

  async function savePlan(id: string, driverId: string, createdAt: Date): Promise<void> {
    const p: RoutePlan = {
      id: makeId<'RoutePlanId'>(id),
      driverId: makeId<'DriverId'>(driverId),
      profileId: makeId<'VehicleProfileId'>('33333333-3333-4333-8333-333333333333'),
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
      geometry: 'encoded-polyline',
      distanceKm: 8,
      durationMin: 8,
      avoidedRestrictions: [],
      maneuvers: [],
      hazardsOnRoute: [],
      createdAt,
    };
    await new PostgresRoutePlanRepository(db).save(p);
  }

  const startTrip = (id: string, planId: string, driverId: string, endedAt: string | null) =>
    pool.query(
      `insert into routing.active_trips (id, route_plan_id, driver_id, started_at, ended_at)
       values ($1, $2, $3, '2026-01-01T09:00:00Z', $4)`,
      [id, planId, driverId, endedAt],
    );

  const alert = (id: string, planId: string, driverId: string, sentAt: string) =>
    pool.query(
      `insert into routing.reroute_alerts
         (id, hazard_id, subject_type, subject_id, driver_id, new_route_plan_id, sent_at)
       values ($1, $2, 'route_plan', $3, $4, $3, $5)`,
      [id, `hazard-${id}`, planId, driverId, sentAt],
    );

  const count = async (table: string, driverId: string) =>
    Number(
      (
        await pool.query<{ n: string }>(
          `select count(*) as n from routing.${table} where driver_id = $1`,
          [driverId],
        )
      ).rows[0]?.n,
    );

  it('erases a driver’s profiles, plans, trips and alerts, and nobody else’s', async () => {
    const profiles = new PostgresVehicleProfileRepository(db);
    const vehicle = (id: string, driverId: string): VehicleProfile => ({
      id: makeId<'VehicleProfileId'>(id),
      driverId: makeId<'DriverId'>(driverId),
      name: 'Wagon',
      dimensions: { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 },
    });
    await profiles.save(vehicle('e0000000-0000-4000-8000-000000000001', ANNA));
    await profiles.save(vehicle('e0000000-0000-4000-8000-000000000002', BEN));
    await savePlan(plan(1), ANNA, new Date('2026-10-01T08:00:00Z'));
    await savePlan(plan(2), BEN, new Date('2026-10-01T08:00:00Z'));
    await startTrip(trip(1), plan(1), ANNA, null);
    await startTrip(trip(2), plan(2), BEN, null);
    await alert('f0000000-0000-4000-8000-000000000001', plan(1), ANNA, '2026-10-02T08:00:00Z');

    await housekeeping().eraseDriver(ANNA);

    for (const table of ['vehicle_profiles', 'route_plans', 'active_trips', 'reroute_alerts']) {
      expect(await count(table, ANNA)).toBe(0);
    }
    expect(await count('vehicle_profiles', BEN)).toBe(1);
    expect(await count('route_plans', BEN)).toBe(1);
    expect(await count('active_trips', BEN)).toBe(1);

    // Running it again (a retried deletion) is harmless.
    await expect(housekeeping().eraseDriver(ANNA)).resolves.toBeUndefined();
  });

  it('deletes route plans older than the cutoff, keeping new ones and any a running trip uses', async () => {
    const CAROL = 'a0000000-0000-4000-8000-000000000003';
    await savePlan(plan(3), CAROL, new Date('2026-01-01T08:00:00Z')); // old, finished trip: goes
    await savePlan(plan(4), CAROL, new Date('2026-01-02T08:00:00Z')); // old, trip still running: stays
    await savePlan(plan(5), CAROL, new Date('2026-01-03T08:00:00Z')); // old, never started: goes
    await savePlan(plan(6), CAROL, new Date('2026-10-05T08:00:00Z')); // recent: stays
    await startTrip(trip(3), plan(3), CAROL, '2026-01-01T10:00:00Z');
    await startTrip(trip(4), plan(4), CAROL, null);
    await alert('f0000000-0000-4000-8000-000000000003', plan(3), CAROL, '2026-01-01T10:00:00Z');

    const removed = await housekeeping().deletePlansOlderThan(new Date('2026-09-01T00:00:00Z'));

    expect(removed).toBe(2);
    const remaining = await pool.query<{ id: string }>(
      `select id from routing.route_plans where driver_id = $1 order by id`,
      [CAROL],
    );
    expect(remaining.rows.map((r) => r.id)).toEqual([plan(4), plan(6)]);
    expect(await count('active_trips', CAROL)).toBe(1); // the running one
    expect(await count('reroute_alerts', CAROL)).toBe(0);
    expect(await housekeeping().deletePlansOlderThan(new Date('2026-09-01T00:00:00Z'))).toBe(0);
  });
});
