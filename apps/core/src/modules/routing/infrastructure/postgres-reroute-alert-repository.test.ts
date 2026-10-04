import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { RerouteAlert } from '../domain/reroute-alert.js';
import type { RoutePlanId } from '../domain/route-plan.js';
import type { UntypedDb } from './db.js';
import { PostgresRerouteAlertRepository } from './postgres-reroute-alert-repository.js';
import { PostgresRoutePlanRepository } from './postgres-route-plan-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresRerouteAlertRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
    // The default `alert()` fixture's newRoutePlanId — shared by every test below that doesn't
    // override it, so it only needs inserting once.
    await insertRoutePlan(makeId<'RoutePlanId'>('44444444-4444-4444-8444-444444444444'));
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const repo = () => new PostgresRerouteAlertRepository(db);

  // `new_route_plan_id` has a real FK into routing.route_plans (migration 0009) — every alert
  // fixture below needs a real row there first, or the insert fails with a FK violation.
  async function insertRoutePlan(id: RoutePlanId): Promise<void> {
    await new PostgresRoutePlanRepository(db).save({
      id,
      driverId: makeId<'DriverId'>('33333333-3333-4333-8333-333333333333'),
      profileId: makeId<'VehicleProfileId'>('12121212-1212-4121-8121-121212121212'),
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
      geometry: 'encoded-polyline',
      distanceKm: 8.038,
      durationMin: 7.9,
      avoidedRestrictions: [],
      maneuvers: [],
      hazardsOnRoute: [],
      createdAt: new Date('2026-06-15T08:00:00.000Z'),
    });
  }

  function alert(overrides: Partial<RerouteAlert> = {}): RerouteAlert {
    return {
      id: makeId<'RerouteAlertId'>('11111111-1111-4111-8111-111111111111'),
      hazardId: 'hazard-1',
      subjectType: 'route_plan',
      subjectId: makeId<'RoutePlanId'>('22222222-2222-4222-8222-222222222222'),
      driverId: makeId<'DriverId'>('33333333-3333-4333-8333-333333333333'),
      newRoutePlanId: makeId<'RoutePlanId'>('44444444-4444-4444-8444-444444444444'),
      sentAt: new Date('2026-06-15T08:00:00.000Z'),
      ...overrides,
    };
  }

  it('exists() is false before a save and true after', async () => {
    const a = alert();
    expect(await repo().exists(a.hazardId, a.subjectType, a.subjectId)).toBe(false);
    await repo().save(a);
    expect(await repo().exists(a.hazardId, a.subjectType, a.subjectId)).toBe(true);
  });

  it('exists() is scoped to the exact (hazardId, subjectType, subjectId) triple', async () => {
    const a = alert({
      id: makeId<'RerouteAlertId'>('55555555-5555-4555-8555-555555555555'),
      hazardId: 'hazard-2',
      subjectId: makeId<'RoutePlanId'>('66666666-6666-4666-8666-666666666666'),
    });
    await repo().save(a);

    expect(await repo().exists('hazard-2', 'route_plan', a.subjectId)).toBe(true);
    expect(await repo().exists('other-hazard', 'route_plan', a.subjectId)).toBe(false);
    expect(await repo().exists('hazard-2', 'active_trip', a.subjectId)).toBe(false);
  });

  it('save() is a no-op on a duplicate (hazardId, subjectType, subjectId) — the dedupe guardrail', async () => {
    await insertRoutePlan(makeId<'RoutePlanId'>('99999999-9999-4999-8999-999999999999'));
    await insertRoutePlan(makeId<'RoutePlanId'>('12121212-1212-4121-8121-121212121212'));
    const subjectId = makeId<'RoutePlanId'>('77777777-7777-4777-8777-777777777777');
    const first = alert({
      id: makeId<'RerouteAlertId'>('88888888-8888-4888-8888-888888888888'),
      hazardId: 'hazard-3',
      subjectId,
      newRoutePlanId: makeId<'RoutePlanId'>('99999999-9999-4999-8999-999999999999'),
    });
    await expect(repo().save(first)).resolves.toBe(true);

    // Redelivery of the same event, or a second subject match on retry — same triple, different
    // alert id/newRoutePlanId. Must not overwrite the first alert's own new-route reference, and
    // must tell the caller it lost (M6.7's own real bug: the caller uses this to decide whether
    // to send a push — a plain `undefined` here can't distinguish "I won" from "I lost").
    const second = alert({
      id: makeId<'RerouteAlertId'>('10101010-1010-4101-8101-101010101010'),
      hazardId: 'hazard-3',
      subjectId,
      newRoutePlanId: makeId<'RoutePlanId'>('12121212-1212-4121-8121-121212121212'),
    });
    await expect(repo().save(second)).resolves.toBe(false);

    const { rows } = await pool.query<{ new_route_plan_id: string }>(
      'select new_route_plan_id from routing.reroute_alerts where hazard_id = $1',
      ['hazard-3'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.new_route_plan_id).toBe('99999999-9999-4999-8999-999999999999');
  });

  describe('countSince', () => {
    it('counts only alerts for the given subject at or after the cutoff', async () => {
      const subjectId = makeId<'RoutePlanId'>('13131313-1313-4131-8131-131313131313');
      const otherSubjectId = makeId<'RoutePlanId'>('14141414-1414-4141-8141-141414141414');

      await repo().save(
        alert({
          id: makeId<'RerouteAlertId'>('15151515-1515-4151-8151-151515151515'),
          hazardId: 'hazard-a',
          subjectId,
          sentAt: new Date('2026-06-15T07:00:00.000Z'), // before the cutoff below
        }),
      );
      await repo().save(
        alert({
          id: makeId<'RerouteAlertId'>('16161616-1616-4161-8161-161616161616'),
          hazardId: 'hazard-b',
          subjectId,
          sentAt: new Date('2026-06-15T08:30:00.000Z'), // at/after the cutoff
        }),
      );
      await repo().save(
        alert({
          id: makeId<'RerouteAlertId'>('17171717-1717-4171-8171-171717171717'),
          hazardId: 'hazard-c',
          subjectId: otherSubjectId, // a different subject entirely
          sentAt: new Date('2026-06-15T08:30:00.000Z'),
        }),
      );

      const count = await repo().countSince(
        'route_plan',
        subjectId,
        new Date('2026-06-15T08:00:00.000Z'),
      );
      expect(count).toBe(1);
    });
  });
});
