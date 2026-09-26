import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { CongestionReport } from '../domain/congestion-report.js';
import type { UntypedDb } from './db.js';
import { PostgresCongestionRepository } from './postgres-congestion-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresCongestionRepository', () => {
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

  const repo = () => new PostgresCongestionRepository(db);

  function report(overrides: Partial<CongestionReport> = {}): CongestionReport {
    return {
      id: makeId<'CongestionReportId'>('11111111-1111-4111-8111-111111111111'),
      reporterId: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
      location: { lat: 54.9698, lon: -2.1013 },
      estimatedWaitMinutes: 15,
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      expiresAt: new Date('2026-06-01T12:15:00.000Z'),
      ...overrides,
    };
  }

  describe('findNearbyLine', () => {
    it('finds a report within the radius and excludes one outside it', async () => {
      const near = report({
        id: makeId<'CongestionReportId'>('55555555-5555-4555-8555-555555555555'),
        location: { lat: 54.975, lon: -2.105 },
      });
      const far = report({
        id: makeId<'CongestionReportId'>('66666666-6666-4666-8666-666666666666'),
        location: { lat: 55.5, lon: -1.5 },
      });
      await repo().save(near);
      await repo().save(far);

      const found = await repo().findNearbyLine([{ lat: 54.9751, lon: -2.1049 }], 50);
      expect(found.map((r) => r.id)).toEqual([near.id]);
    });

    it('finds a report within the radius of a multi-point corridor', async () => {
      const onCorridor = report({
        id: makeId<'CongestionReportId'>('30303030-3030-4303-8303-303030303030'),
        location: { lat: 54.975, lon: -2.09 },
      });
      const farFromCorridor = report({
        id: makeId<'CongestionReportId'>('40404040-4040-4404-8404-404040404040'),
        location: { lat: 55.5, lon: -1.5 },
      });
      await repo().save(onCorridor);
      await repo().save(farFromCorridor);

      const corridor = [
        { lat: 54.97, lon: -2.1 },
        { lat: 54.975, lon: -2.0901 },
        { lat: 54.98, lon: -2.08 },
      ];
      const found = await repo().findNearbyLine(corridor, 50);
      expect(found.map((r) => r.id)).toEqual([onCorridor.id]);
    });

    it('returns an empty array for an empty corridor', async () => {
      expect(await repo().findNearbyLine([], 50)).toEqual([]);
    });

    it('returns an empty array when nothing is nearby', async () => {
      expect(await repo().findNearbyLine([{ lat: 10, lon: 10 }], 50)).toEqual([]);
    });
  });

  describe('save', () => {
    it('round-trips a report, reloadable via findNearbyLine', async () => {
      const r = report({
        id: makeId<'CongestionReportId'>('77777777-7777-4777-8777-777777777777'),
      });
      await repo().save(r);

      const found = await repo().findNearbyLine([r.location], 50);
      expect(found).toEqual([r]);
    });
  });
});
