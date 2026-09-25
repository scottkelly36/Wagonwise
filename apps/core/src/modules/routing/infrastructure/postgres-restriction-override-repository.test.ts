import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'kysely';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { RestrictionOverride } from '../domain/restriction-override.js';
import type { UntypedDb } from './db.js';
import { PostgresRestrictionOverrideRepository } from './postgres-restriction-override-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresRestrictionOverrideRepository', () => {
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

  const repo = () => new PostgresRestrictionOverrideRepository(db);

  // No `save()` on the port (no CRUD endpoint in Phase 1 — overrides are seeded directly), so
  // test rows go in via raw SQL, the same shape a real seed would use.
  async function insert(override: RestrictionOverride): Promise<void> {
    await sql`
      insert into routing.restriction_overrides (id, kind, limit_value, location, note, created_at)
      values (
        ${override.id}, ${override.kind}, ${override.limit ?? null},
        ST_SetSRID(ST_MakePoint(${override.location.lon}, ${override.location.lat}), 4326)::geography,
        ${override.note ?? null}, ${override.createdAt}
      )
    `.execute(db);
  }

  function override(overrides: Partial<RestrictionOverride> = {}): RestrictionOverride {
    return {
      id: makeId<'RestrictionOverrideId'>('11111111-1111-4111-8111-111111111111'),
      kind: 'height',
      limit: 3.8,
      location: { lat: 54.9698, lon: -2.1013 },
      note: 'Styford Bridge',
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      ...overrides,
    };
  }

  // Every test below uses its own id *and* its own well-separated location — this suite shares
  // one container/schema across all tests with no per-test cleanup (matching the hazards repo
  // test's own convention), so two tests placing a row at the same spot would see each other's
  // data through `findNearbyLine`'s real spatial query.

  it('finds an override within the radius of a single-point corridor', async () => {
    const near = override({
      id: makeId<'RestrictionOverrideId'>('11111111-1111-4111-8111-111111111111'),
      location: { lat: 54.9698, lon: -2.1013 },
    });
    await insert(near);

    const found = await repo().findNearbyLine([{ lat: 54.9701, lon: -2.1011 }], 50);
    expect(found).toEqual([near]);
  });

  it('excludes an override outside the radius', async () => {
    await insert(
      override({
        id: makeId<'RestrictionOverrideId'>('22222222-2222-4222-8222-222222222222'),
        location: { lat: 55.5, lon: -1.5 },
      }),
    );

    const found = await repo().findNearbyLine([{ lat: 55.5001, lon: -1.5001 }], 5);
    expect(found).toEqual([]);
  });

  it('round-trips an override with no limit and no note', async () => {
    const minimal = override({
      id: makeId<'RestrictionOverrideId'>('33333333-3333-4333-8333-333333333333'),
      kind: 'prohibition',
      limit: undefined,
      location: { lat: 54.9601, lon: -2.06 },
      note: undefined,
    });
    await insert(minimal);

    const found = await repo().findNearbyLine([minimal.location], 50);
    expect(found).toEqual([minimal]);
  });

  it('finds an override within the radius of a multi-point corridor', async () => {
    const onCorridor = override({
      id: makeId<'RestrictionOverrideId'>('44444444-4444-4444-8444-444444444444'),
      location: { lat: 54.975, lon: -2.09 },
    });
    const farFromCorridor = override({
      id: makeId<'RestrictionOverrideId'>('55555555-5555-4555-8555-555555555555'),
      location: { lat: 50.0, lon: 0.0 },
    });
    await insert(onCorridor);
    await insert(farFromCorridor);

    const corridor = [
      { lat: 54.97, lon: -2.1 },
      { lat: 54.975, lon: -2.0901 },
      { lat: 54.98, lon: -2.08 },
    ];
    const found = await repo().findNearbyLine(corridor, 50);
    expect(found.map((o) => o.id)).toEqual([onCorridor.id]);
  });

  it('returns an empty array for an empty corridor', async () => {
    await insert(
      override({
        id: makeId<'RestrictionOverrideId'>('66666666-6666-4666-8666-666666666666'),
        location: { lat: 40.0, lon: 0.0 },
      }),
    );
    expect(await repo().findNearbyLine([], 50)).toEqual([]);
  });
});
