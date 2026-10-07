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

    it('copes with a corridor as long as a route across Britain (tens of thousands of points)', async () => {
      // Postgres allows 65,535 bound values per query. A corridor built from one ST_MakePoint call per
      // point (two values each) failed at about 32,000 points, which a long journey exceeds.
      const nearTheMiddle = report({
        id: makeId<'HazardReportId'>('70707070-7070-4707-8707-707070707070'),
        location: { lat: 52.5, lon: -1.5 },
      });
      await repo().save(nearTheMiddle);

      // About 1,100 km due north to south, with a point every 11 m: 100,000 points.
      const corridor = Array.from({ length: 100_000 }, (_, i) => ({
        lat: 58 - i * 0.0001,
        lon: -1.5,
      }));
      const found = await repo().findNearbyLine(corridor, 50);
      expect(found.map((r) => r.id)).toContain(nearTheMiddle.id);
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

  describe('moderation (P2-M7.1)', () => {
    const MOD = makeId<'StaffId'>('99999999-9999-4999-8999-999999999999');
    const id = (n: number) => makeId<'HazardReportId'>(`a0a0a0a0-0000-4000-8000-00000000000${n}`);
    const decision = (hazardId: HazardReport['id'], n: number, action: 'approve' | 'reject') => ({
      id: makeId<'ModerationDecisionId'>(`d0d0d0d0-0000-4000-8000-00000000000${n}`),
      hazardId,
      moderatorId: MOD,
      action,
      note: 'checked',
      before: { type: 'low_bridge' as const, status: 'active' as const },
      after: {
        type: 'low_bridge' as const,
        status: action === 'reject' ? ('dismissed' as const) : ('active' as const),
      },
      decidedAt: new Date(`2026-06-02T12:0${n}:00.000Z`),
    });

    it('queues active blocking or disputed reports that have no approval, oldest first', async () => {
      const blockingOld = report({ id: id(1), createdAt: new Date('2026-06-01T10:00:00.000Z') });
      const blockingNew = report({ id: id(2), createdAt: new Date('2026-06-01T11:00:00.000Z') });
      const approved = report({ id: id(3) });
      const advisoryQuiet = report({ id: id(4), type: 'tight_bend' });
      const advisoryDisputed = report({
        id: id(5),
        type: 'roadworks',
        confirmations: 1,
        dismissals: 1,
        createdAt: new Date('2026-06-01T12:00:00.000Z'),
      });
      const dismissed = report({ id: id(6), status: 'dismissed' });
      for (const r of [
        blockingNew,
        blockingOld,
        approved,
        advisoryQuiet,
        advisoryDisputed,
        dismissed,
      ]) {
        await repo().save(r);
      }
      await repo().saveModerated(approved, decision(approved.id, 1, 'approve'), []);

      const ours = new Set([1, 2, 3, 4, 5, 6].map(id));
      const queue = (await repo().findAwaitingReview()).filter((r) => ours.has(r.id));

      expect(queue.map((r) => r.id)).toEqual([id(1), id(2), id(5)]);
    });

    it('applies a decision atomically: the changed report, the audit row and the event', async () => {
      const original = report({
        id: id(7),
        measurement: { kind: 'height', value: 4, unit: 'm' },
      });
      await repo().save(original);
      const changed = { ...original, status: 'dismissed' as const };

      await repo().saveModerated(changed, decision(original.id, 2, 'reject'), [
        {
          eventId: 'e0e0e0e0-0000-4000-8000-000000000001',
          aggregateType: 'HazardReport',
          aggregateId: original.id,
          eventType: 'HazardModerated',
          payload: { hazardId: original.id },
        },
      ]);

      expect((await repo().findById(original.id))?.status).toBe('dismissed');
      const decisions = await repo().findDecisions(original.id);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({
        action: 'reject',
        moderatorId: MOD,
        note: 'checked',
        before: { status: 'active' },
        after: { status: 'dismissed' },
      });
      const { rows } = await pool.query(
        `select event_type from outbox.events where aggregate_id = $1`,
        [original.id],
      );
      expect(rows).toEqual([{ event_type: 'HazardModerated' }]);
    });

    it('keeps the audit record after the report itself is deleted', async () => {
      const r = report({ id: id(8) });
      await repo().save(r);
      await repo().saveModerated(r, decision(r.id, 3, 'approve'), []);
      await repo().deleteById(r.id);
      expect(await repo().findDecisions(r.id)).toHaveLength(1);
    });

    it('round-trips a snapshot with a measurement and an expiry', async () => {
      const r = report({ id: id(9) });
      await repo().save(r);
      const withDetail = {
        ...decision(r.id, 4, 'approve'),
        before: {
          type: 'low_bridge' as const,
          status: 'active' as const,
          measurement: { kind: 'height' as const, value: 4, unit: 'm' as const },
          expiresAt: new Date('2026-06-08T12:00:00.000Z'),
        },
      };
      await repo().saveModerated(r, withDetail, []);
      const [stored] = await repo().findDecisions(r.id);
      expect(stored?.before).toEqual(withDetail.before);
    });
  });

  describe('reporter records (P2-M7.2)', () => {
    const MOD = makeId<'StaffId'>('99999999-9999-4999-8999-999999999999');
    const REPORTER = makeId<'DriverId'>('c1c1c1c1-0000-4000-8000-000000000001');
    const NEWCOMER = makeId<'DriverId'>('c1c1c1c1-0000-4000-8000-000000000002');
    const id = (n: number) => makeId<'HazardReportId'>(`b0b0b0b0-0000-4000-8000-00000000000${n}`);
    const decision = (hazardId: HazardReport['id'], n: number, action: 'approve' | 'reject') => ({
      id: makeId<'ModerationDecisionId'>(`e0e0e0e0-0000-4000-8000-00000000000${n}`),
      hazardId,
      moderatorId: MOD,
      action,
      before: { type: 'low_bridge' as const, status: 'active' as const },
      after: { type: 'low_bridge' as const, status: 'active' as const },
      decidedAt: new Date(`2026-06-02T12:0${n}:00.000Z`),
    });

    it('counts approved, moderator-rejected and community-dismissed reports per reporter', async () => {
      const approved = report({ id: id(1), reporterId: REPORTER });
      const rejected = report({ id: id(2), reporterId: REPORTER, status: 'dismissed' });
      const communityDismissed = report({ id: id(3), reporterId: REPORTER, status: 'dismissed' });
      const untouched = report({ id: id(4), reporterId: REPORTER });
      for (const r of [approved, rejected, communityDismissed, untouched]) {
        await repo().save(r);
      }
      await repo().saveModerated(approved, decision(approved.id, 1, 'approve'), []);
      await repo().saveModerated(rejected, decision(rejected.id, 2, 'reject'), []);

      const records = await repo().findReporterRecords([REPORTER, NEWCOMER]);

      expect(records.get(REPORTER)).toEqual({
        approved: 1,
        rejected: 1,
        communityDismissed: 1,
      });
      expect(records.has(NEWCOMER)).toBe(false);
    });

    it('returns nothing for an empty list of reporters', async () => {
      expect((await repo().findReporterRecords([])).size).toBe(0);
    });

    it('finds which of some reports a moderator approved', async () => {
      const approved = report({ id: id(5), reporterId: REPORTER });
      const other = report({ id: id(6), reporterId: REPORTER });
      await repo().save(other);
      await repo().saveModerated(approved, decision(approved.id, 5, 'approve'), []);

      const found = await repo().findApprovedIds([approved.id, other.id]);

      expect([...found]).toEqual([approved.id]);
      expect((await repo().findApprovedIds([])).size).toBe(0);
    });
  });
});
