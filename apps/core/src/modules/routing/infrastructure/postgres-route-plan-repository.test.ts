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

  it('returns null for an unknown id', async () => {
    expect(
      await repo().findById(makeId<'RoutePlanId'>('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });
});
