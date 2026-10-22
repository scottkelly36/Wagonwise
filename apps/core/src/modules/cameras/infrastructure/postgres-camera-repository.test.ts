import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UntypedDb } from './db.js';
import { PostgresCameraRepository } from './postgres-camera-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresCameraRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
    // The starting set from migration 0075 would be in the way of these tests.
    await pool.query('delete from cameras.speed_cameras');
    await pool.query(`
      insert into cameras.speed_cameras (id, osm_id, location, kind, maxspeed_mph) values
      ('11111111-1111-4111-8111-111111111111', 'node/1', ST_SetSRID(ST_MakePoint(-2.1000, 54.9700), 4326)::geography, 'fixed', 40),
      ('22222222-2222-4222-8222-222222222222', 'node/2', ST_SetSRID(ST_MakePoint(-2.0900, 54.9800), 4326)::geography, 'red_light', null),
      -- about 20 m off the route: the other carriageway
      ('33333333-3333-4333-8333-333333333333', 'node/3', ST_SetSRID(ST_MakePoint(-2.0950, 54.97536), 4326)::geography, 'average', null)
    `);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const repo = () => new PostgresCameraRepository(db);

  it('finds the cameras on a route and not one on the other carriageway', async () => {
    const found = await repo().findNearbyLine(
      [
        { lat: 54.97, lon: -2.1 },
        { lat: 54.98, lon: -2.09 },
      ],
      12,
    );
    expect(found.map((c) => [c.kind, c.maxspeedMph])).toEqual([
      ['fixed', 40],
      ['red_light', undefined],
    ]);
    expect(found[0]!.location.lat).toBeCloseTo(54.97, 4);
  });

  it('finds the cameras near a single point', async () => {
    const found = await repo().findNearbyLine([{ lat: 54.97, lon: -2.1 }], 12);
    expect(found).toHaveLength(1);
  });

  it('finds nothing for an empty route or a route with none', async () => {
    expect(await repo().findNearbyLine([], 12)).toEqual([]);
    expect(await repo().findNearbyLine([{ lat: 51.5, lon: -0.1 }], 12)).toEqual([]);
  });
});
