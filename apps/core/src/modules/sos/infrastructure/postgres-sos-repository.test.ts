import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { SosAlert } from '../domain/sos.js';
import type { UntypedDb } from './db.js';
import { PostgresSosRepository } from './postgres-sos-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const pat = makeId<'DriverId'>('d0000000-0000-4000-8000-000000000001');
const lee = makeId<'DriverId'>('d0000000-0000-4000-8000-000000000002');
const staff = makeId<'StaffId'>('f0000000-0000-4000-8000-000000000001');
const at = new Date('2026-10-25T10:00:00.000Z');

function alert(n: number, overrides: Partial<SosAlert> = {}): SosAlert {
  return {
    id: makeId<'SosAlertId'>(
      `a000000${n.toString(16)}-0000-4000-8000-00000000000${n.toString(16)}`,
    ),
    requestId: `b000000${n.toString(16)}-0000-4000-8000-00000000000${n.toString(16)}`,
    companyId: acme,
    driverId: pat,
    driverName: 'Pat Smith',
    driverContact: '+447700900123',
    vehicleName: 'Scania R450',
    vehicleRegistration: 'AB12 CDE',
    jobReference: 'JOB-77',
    location: { lat: 54.9731, lon: -2.1013 },
    words: 'recapture.streaking.parent',
    nearestPlace: 'Hexham, Northumberland',
    status: 'open',
    createdAt: at,
    updatedAt: at,
    resolvedBy: undefined,
    resolvedAt: undefined,
    ...overrides,
  };
}

describe('PostgresSosRepository', () => {
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

  const repo = () => new PostgresSosRepository(db);

  it('round-trips an alert, with everything the office was told', async () => {
    const a = alert(1);
    await repo().insertAll([a]);
    expect(await repo().findById(a.id)).toEqual(a);
  });

  it('round-trips an alert with no words, no vehicle and no job', async () => {
    const bare = alert(2, {
      driverName: undefined,
      driverContact: undefined,
      vehicleName: undefined,
      vehicleRegistration: undefined,
      jobReference: undefined,
      words: undefined,
      nearestPlace: undefined,
    });
    await repo().insertAll([bare]);
    expect(await repo().findById(bare.id)).toEqual(bare);
  });

  it('stores one alert for a press and company, and a second try changes nothing', async () => {
    const first = alert(3);
    await repo().insertAll([first]);
    await repo().insertAll([
      {
        ...first,
        id: makeId<'SosAlertId'>('a0000099-0000-4000-8000-000000000099'),
        words: 'other.other.other',
      },
    ]);
    const found = await repo().findByRequest(first.requestId, pat);
    expect(found).toHaveLength(1);
    expect(found[0]?.words).toBe('recapture.streaking.parent');
    // Another driver does not find it by the same request.
    expect(await repo().findByRequest(first.requestId, lee)).toEqual([]);
  });

  it('lists a company’s alerts newest first, open or all, and only that company’s', async () => {
    const older = alert(4, {
      createdAt: new Date('2026-10-25T09:00:00.000Z'),
      updatedAt: new Date('2026-10-25T09:00:00.000Z'),
    });
    const newer = alert(5, {
      createdAt: new Date('2026-10-25T11:00:00.000Z'),
      updatedAt: new Date('2026-10-25T11:00:00.000Z'),
    });
    const theirs = alert(6, { companyId: beta });
    await repo().insertAll([older, newer, theirs]);
    await repo().resolve(older.id, staff, at);
    const open = (await repo().listForCompany(acme, 'open', 50)).map((a) => a.id);
    expect(open).toContain(newer.id);
    expect(open).not.toContain(older.id);
    expect(open).not.toContain(theirs.id);
    const all = (await repo().listForCompany(acme, 'all', 50)).map((a) => a.id);
    expect(all.indexOf(newer.id)).toBeLessThan(all.indexOf(older.id));
    expect(await repo().listForCompany(acme, 'all', 1)).toHaveLength(1);
  });

  it('resolves an open alert once, saying who and when', async () => {
    const a = alert(7);
    await repo().insertAll([a]);
    await repo().resolve(a.id, staff, new Date('2026-10-25T10:05:00.000Z'));
    expect(await repo().findById(a.id)).toMatchObject({
      status: 'resolved',
      resolvedBy: staff,
      resolvedAt: new Date('2026-10-25T10:05:00.000Z'),
    });
    await repo().resolve(
      a.id,
      makeId<'StaffId'>('f0000000-0000-4000-8000-000000000002'),
      new Date('2026-10-25T12:00:00.000Z'),
    );
    expect((await repo().findById(a.id))?.resolvedBy).toBe(staff);
  });

  it('cancels only the driver’s own open alerts for the press, and says which', async () => {
    const mine = alert(8);
    const alsoMine = alert(8, {
      id: makeId<'SosAlertId'>('a0000088-0000-4000-8000-000000000088'),
      companyId: beta,
    });
    await repo().insertAll([mine, alsoMine]);
    expect(await repo().cancelRequest(mine.requestId, lee, at)).toEqual([]);
    const cancelled = await repo().cancelRequest(
      mine.requestId,
      pat,
      new Date('2026-10-25T10:10:00.000Z'),
    );
    expect(cancelled.map((a) => a.id).sort()).toEqual([mine.id, alsoMine.id].sort());
    expect(cancelled.every((a) => a.status === 'cancelled')).toBe(true);
    expect(await repo().cancelRequest(mine.requestId, pat, at)).toEqual([]);
  });

  it('deletes closed alerts past the cutoff, never an open one, and erases a driver', async () => {
    const closedOld = alert(9, {
      status: 'cancelled',
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const closedNew = alert(10, {
      status: 'cancelled',
      updatedAt: new Date('2026-10-24T00:00:00.000Z'),
    });
    const openOld = alert(11, {
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await repo().insertAll([closedOld, closedNew, openOld]);
    const deleted = await repo().deleteClosedBefore(new Date('2026-10-01T00:00:00.000Z'));
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await repo().findById(closedOld.id)).toBeNull();
    expect(await repo().findById(closedNew.id)).not.toBeNull();
    expect(await repo().findById(openOld.id)).not.toBeNull();

    const leaver = makeId<'DriverId'>('d0000000-0000-4000-8000-0000000000aa');
    const theirs = alert(12, { driverId: leaver });
    await repo().insertAll([theirs]);
    await repo().eraseDriver(leaver);
    await repo().eraseDriver(leaver);
    expect(await repo().findById(theirs.id)).toBeNull();
    expect(await repo().findById(openOld.id)).not.toBeNull();
  });
});
