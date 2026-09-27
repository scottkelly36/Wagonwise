import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from '../domain/hazard-report.js';
import type { UntypedDb } from './db.js';
import { PostgresHazardRepository } from './postgres-hazard-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresHazardRepository', () => {
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

  const repo = () => new PostgresHazardRepository(db);

  function report(overrides: Partial<HazardReport> = {}): HazardReport {
    return {
      id: makeId<'HazardReportId'>('11111111-1111-4111-8111-111111111111'),
      reporterId: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
      type: 'low_bridge',
      location: { lat: 54.9698, lon: -2.1013 },
      source: 'tap',
      confirmations: 0,
      dismissals: 0,
      status: 'active',
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      ...overrides,
    };
  }

  it('round-trips a report with no note and no measurement', async () => {
    const r = report();
    await repo().save(r);
    expect(await repo().findById(r.id)).toEqual(r);
  });

  it('round-trips a report with a note and a measurement', async () => {
    const r = report({
      id: makeId<'HazardReportId'>('33333333-3333-4333-8333-333333333333'),
      note: 'Looked lower than signed',
      measurement: { kind: 'height', value: 3.4, unit: 'm' },
      expiresAt: new Date('2026-06-08T12:00:00.000Z'),
    });
    await repo().save(r);
    expect(await repo().findById(r.id)).toEqual(r);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await repo().findById(makeId<'HazardReportId'>('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });

  it('save with the same id overwrites the row rather than inserting a new one', async () => {
    const r = report({ id: makeId<'HazardReportId'>('44444444-4444-4444-8444-444444444444') });
    await repo().save(r);
    const updated: HazardReport = { ...r, confirmations: 2, status: 'active' };
    await repo().save(updated);
    expect(await repo().findById(r.id)).toEqual(updated);
  });

  describe('findAll', () => {
    it('returns every report saved so far, regardless of status or location', async () => {
      const all = await repo().findAll();
      expect(all.map((r) => r.id)).toContain(
        makeId<'HazardReportId'>('11111111-1111-4111-8111-111111111111'),
      );
      expect(all.map((r) => r.id)).toContain(
        makeId<'HazardReportId'>('44444444-4444-4444-8444-444444444444'),
      );
    });
  });

  describe('findNearby', () => {
    it('finds a report within the radius and excludes one outside it', async () => {
      const near = report({
        id: makeId<'HazardReportId'>('55555555-5555-4555-8555-555555555555'),
        location: { lat: 54.975, lon: -2.105 },
      });
      const far = report({
        id: makeId<'HazardReportId'>('66666666-6666-4666-8666-666666666666'),
        location: { lat: 55.5, lon: -1.5 },
      });
      await repo().save(near);
      await repo().save(far);

      const found = await repo().findNearby({ lat: 54.9751, lon: -2.1049 }, 50);
      expect(found.map((r) => r.id)).toEqual([near.id]);
    });

    it('orders results most-recently-created first', async () => {
      const older = report({
        id: makeId<'HazardReportId'>('77777777-7777-4777-8777-777777777777'),
        location: { lat: 54.98, lon: -2.11 },
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      const newer = report({
        id: makeId<'HazardReportId'>('88888888-8888-4888-8888-888888888888'),
        location: { lat: 54.98, lon: -2.11 },
        createdAt: new Date('2026-06-02T00:00:00.000Z'),
      });
      await repo().save(older);
      await repo().save(newer);

      const found = await repo().findNearby({ lat: 54.98, lon: -2.11 }, 50);
      expect(found.map((r) => r.id)).toEqual([newer.id, older.id]);
    });

    it('returns an empty array when nothing is nearby', async () => {
      expect(await repo().findNearby({ lat: 10, lon: 10 }, 50)).toEqual([]);
    });
  });

  describe('findNearbyLine', () => {
    it('finds a report within the radius of a multi-point corridor', async () => {
      const onCorridor = report({
        id: makeId<'HazardReportId'>('30303030-3030-4303-8303-303030303030'),
        location: { lat: 54.975, lon: -2.09 },
      });
      const farFromCorridor = report({
        id: makeId<'HazardReportId'>('40404040-4040-4404-8404-404040404040'),
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

    it('finds a report near a line segment even when no single vertex is close to it', async () => {
      // Real-world corridors are dense decoded polylines, but this proves the query uses the
      // actual line geometry (ST_DWithin against ST_MakeLine), not just distance-to-nearest-vertex
      // — the point sits ~15m off the segment's midpoint, far from either endpoint.
      const onSegment = report({
        id: makeId<'HazardReportId'>('50505050-5050-4505-8505-505050505050'),
        location: { lat: 54.9601, lon: -2.06 },
      });
      await repo().save(onSegment);

      const corridor = [
        { lat: 54.96, lon: -2.07 },
        { lat: 54.96, lon: -2.05 },
      ];
      const found = await repo().findNearbyLine(corridor, 50);
      expect(found.map((r) => r.id)).toContain(onSegment.id);
    });

    it('degrades to a plain radius check for a single-point corridor', async () => {
      const near = report({
        id: makeId<'HazardReportId'>('60606060-6060-4606-8606-606060606060'),
        location: { lat: 54.9501, lon: -2.05 },
      });
      await repo().save(near);

      const found = await repo().findNearbyLine([{ lat: 54.95, lon: -2.05 }], 50);
      expect(found.map((r) => r.id)).toEqual([near.id]);
    });

    it('returns an empty array for an empty corridor', async () => {
      expect(await repo().findNearbyLine([], 50)).toEqual([]);
    });

    it('returns an empty array when nothing is nearby the corridor', async () => {
      const corridor = [
        { lat: 10, lon: 10 },
        { lat: 10.01, lon: 10.01 },
      ];
      expect(await repo().findNearbyLine(corridor, 50)).toEqual([]);
    });
  });

  describe('findExpirable', () => {
    it('finds an active report past its expiresAt', async () => {
      const overdue = report({
        id: makeId<'HazardReportId'>('99999999-9999-4999-8999-999999999999'),
        type: 'roadworks',
        expiresAt: new Date('2026-06-10T00:00:00.000Z'),
      });
      await repo().save(overdue);

      const found = await repo().findExpirable(new Date('2026-06-10T00:00:00.000Z'));
      expect(found.map((r) => r.id)).toContain(overdue.id);
    });

    it('excludes a report that has not reached its expiresAt yet', async () => {
      const notYet = report({
        id: makeId<'HazardReportId'>('10101010-1010-4101-8101-101010101010'),
        type: 'roadworks',
        expiresAt: new Date('2026-07-01T00:00:00.000Z'),
      });
      await repo().save(notYet);

      const found = await repo().findExpirable(new Date('2026-06-10T00:00:00.000Z'));
      expect(found.map((r) => r.id)).not.toContain(notYet.id);
    });

    it('excludes a report that is not active, even if overdue', async () => {
      const dismissed = report({
        id: makeId<'HazardReportId'>('20202020-2020-4202-8202-202020202020'),
        type: 'roadworks',
        status: 'dismissed',
        expiresAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await repo().save(dismissed);

      const found = await repo().findExpirable(new Date('2026-06-10T00:00:00.000Z'));
      expect(found.map((r) => r.id)).not.toContain(dismissed.id);
    });
  });

  describe('save with events (M6.3)', () => {
    it('writes the row and the outbox event in one call, both visible afterwards', async () => {
      const r = report({ id: makeId<'HazardReportId'>('30303030-3030-4303-8303-303030303030') });
      const event = {
        eventId: '40404040-4040-4404-8404-404040404040',
        aggregateType: 'HazardReport',
        aggregateId: r.id,
        eventType: 'HazardReported',
        payload: { hazardId: r.id, reporterId: r.reporterId, type: r.type, location: r.location },
      };

      await repo().save(r, [event]);

      expect(await repo().findById(r.id)).toEqual(r);

      const { rows } = await pool.query<{
        event_id: string;
        aggregate_type: string;
        aggregate_id: string;
        event_type: string;
        payload: unknown;
        processed_at: Date | null;
      }>('select * from outbox.events where event_id = $1', [event.eventId]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        aggregate_type: 'HazardReport',
        aggregate_id: r.id,
        event_type: 'HazardReported',
        payload: {
          hazardId: r.id,
          reporterId: r.reporterId,
          type: r.type,
          location: r.location,
        },
      });
      expect(rows[0]?.processed_at).toBeNull(); // not yet picked up by the dispatcher
    });

    it('calling save with no events writes no outbox row at all', async () => {
      const r = report({ id: makeId<'HazardReportId'>('50505050-5050-4505-8505-505050505050') });
      await repo().save(r);

      const { rows } = await pool.query('select 1 from outbox.events where aggregate_id = $1', [
        r.id,
      ]);
      expect(rows).toEqual([]);
    });
  });
});
