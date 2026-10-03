import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../shared/brand.js';
import { FakeClock } from '../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../shared/testing/sequential-id-generator.js';
import { createHazardsModule, type HazardsModule } from './api.js';
import { StubAdminDirectory } from './application/testing/stub-admin-directory.js';
import type { HazardReport } from './domain/hazard-report.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresHazardRepository } from './infrastructure/postgres-hazard-repository.js';
import { applySchema } from './infrastructure/testing/apply-schema.js';
import { createDb, createPool } from './infrastructure/testing/db-for-tests.js';

/**
 * P2-M7.2: `findAvoidanceCandidates` is the one place routing becomes less cautious, so it is
 * tested through the real facade and a real PostGIS database, not only through its parts.
 */
describe('findAvoidanceCandidates and the doubtful-report hold', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;
  let hazards: HazardsModule;
  let repo: PostgresHazardRepository;

  const now = new Date('2026-06-15T08:00:00.000Z');
  const BAD = makeId<'DriverId'>('d1d1d1d1-0000-4000-8000-000000000001');
  const NEW = makeId<'DriverId'>('d1d1d1d1-0000-4000-8000-000000000002');
  const MOD = makeId<'StaffId'>('99999999-9999-4999-8999-999999999999');
  // Two points about 110 m apart so reports at each stay separate, and one corridor covers both.
  const spotA = { lat: 54.97, lon: -2.1 };
  const spotB = { lat: 54.971, lon: -2.1 };
  const corridor = [
    { lat: 54.969, lon: -2.1 },
    { lat: 54.972, lon: -2.1 },
  ];
  let counter = 0;

  function report(overrides: Partial<HazardReport>): HazardReport {
    counter += 1;
    return {
      id: makeId<'HazardReportId'>(`f0f0f0f0-0000-4000-8000-${String(counter).padStart(12, '0')}`),
      reporterId: NEW,
      type: 'low_bridge',
      location: spotA,
      source: 'tap',
      confirmations: 0,
      dismissals: 0,
      status: 'active',
      createdAt: now,
      ...overrides,
    };
  }

  function decision(r: HazardReport, action: 'approve' | 'reject') {
    counter += 1;
    const fields = { type: r.type, status: r.status };
    return {
      id: makeId<'ModerationDecisionId'>(
        `e1e1e1e1-0000-4000-8000-${String(counter).padStart(12, '0')}`,
      ),
      hazardId: r.id,
      moderatorId: MOD,
      action,
      before: fields,
      after: fields,
      decidedAt: now,
    };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
    repo = new PostgresHazardRepository(db);
    hazards = createHazardsModule({
      db,
      clock: new FakeClock(now),
      ids: new SequentialIdGenerator(),
      admins: new StubAdminDirectory(),
    });
    // BAD has two moderator-rejected reports: low trust.
    for (let i = 0; i < 2; i++) {
      const rejected = report({
        reporterId: BAD,
        status: 'dismissed',
        location: { lat: 55.5, lon: -1 },
      });
      await repo.saveModerated(rejected, decision(rejected, 'reject'), []);
    }
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('holds back a low-trust reporter’s unmeasured, unconfirmed blocking report', async () => {
    const doubtful = report({ reporterId: BAD, location: spotA });
    await repo.save(doubtful);

    const ids = (await hazards.findAvoidanceCandidates(corridor, 50)).map((c) => c.id);

    expect(ids).not.toContain(doubtful.id);
  });

  it('still routes around a first-time reporter’s identical report', async () => {
    const fresh = report({ reporterId: NEW, location: spotB });
    await repo.save(fresh);

    const ids = (await hazards.findAvoidanceCandidates(corridor, 50)).map((c) => c.id);

    expect(ids).toContain(fresh.id);
  });

  it('routes around a low-trust reporter’s report once it carries a measurement', async () => {
    const measured = report({
      reporterId: BAD,
      location: { lat: 54.9705, lon: -2.1 },
      measurement: { kind: 'height', value: 3.5, unit: 'm' },
    });
    await repo.save(measured);

    const found = await hazards.findAvoidanceCandidates(corridor, 50);

    expect(found.find((c) => c.id === measured.id)).toMatchObject({ kind: 'height', limit: 3.5 });
  });

  it('routes around a held-back report again once a moderator approves it', async () => {
    const doubtful = report({ reporterId: BAD, location: { lat: 54.9708, lon: -2.1 } });
    await repo.save(doubtful);
    expect((await hazards.findAvoidanceCandidates(corridor, 50)).map((c) => c.id)).not.toContain(
      doubtful.id,
    );

    await repo.saveModerated(doubtful, decision(doubtful, 'approve'), []);

    expect((await hazards.findAvoidanceCandidates(corridor, 50)).map((c) => c.id)).toContain(
      doubtful.id,
    );
  });

  it('keeps a held-back report on the route’s hazard list: it is hidden from routing only', async () => {
    const doubtful = report({ reporterId: BAD, location: { lat: 54.9712, lon: -2.1 } });
    await repo.save(doubtful);

    expect(await hazards.findHazardIdsNear(corridor, 50)).toContain(doubtful.id);
  });
});
