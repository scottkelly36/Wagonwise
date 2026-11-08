import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { itemState, resolveRange, type RawAuditData } from '../domain/audit-pack.js';
import {
  getVehicleAuditPack,
  type AuditDeps,
  type StaffCaller,
  type VehicleDirectory,
} from './audit-pack.js';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const VEHICLE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRIVER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OFFICE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const ADMIN: StaffCaller = { kind: 'platform' };
const fleet = (privileges: string[], companyId = COMPANY): StaffCaller => ({
  kind: 'fleet',
  companyId,
  privileges,
});

const RAW: RawAuditData = {
  checks: [
    {
      id: 'c2',
      templateName: 'Daily walk-round',
      templateVersion: 3,
      driverId: DRIVER,
      checkDay: '2026-11-03',
      submittedAt: new Date('2026-11-03T06:30:00.000Z'),
      result: 'do_not_drive',
      defectCount: 1,
    },
    {
      id: 'c1',
      templateName: 'Daily walk-round',
      templateVersion: 3,
      driverId: DRIVER,
      checkDay: '2026-11-02',
      submittedAt: new Date('2026-11-02T06:30:00.000Z'),
      result: 'clear',
      defectCount: 0,
    },
  ],
  defects: [
    {
      id: 'd-old',
      checkId: 'c0',
      foundByDriverId: 'unknown-driver',
      label: 'Wiper blade',
      severity: 'advisory',
      detail: 'Splitting',
      note: undefined,
      status: 'acknowledged',
      createdAt: new Date('2026-09-01T07:00:00.000Z'),
      statusChangedAt: new Date('2026-09-02T09:00:00.000Z'),
      statusChangedBy: OFFICE,
    },
    {
      id: 'd1',
      checkId: 'c2',
      foundByDriverId: DRIVER,
      label: 'Nearside brake light',
      severity: 'do_not_drive',
      detail: 'Not working',
      note: 'Bulb gone',
      status: 'fixed',
      createdAt: new Date('2026-11-03T06:31:00.000Z'),
      statusChangedAt: new Date('2026-11-04T10:00:00.000Z'),
      statusChangedBy: 'someone-who-left',
    },
  ],
  repairs: [
    {
      defectId: 'd1',
      title: 'Replace brake light',
      dueDate: '2026-11-04',
      status: 'done',
      note: 'New bulb fitted',
      doneOn: '2026-11-04',
      createdAt: new Date('2026-11-03T08:00:00.000Z'),
      createdBy: OFFICE,
      completedAt: new Date('2026-11-04T10:00:00.000Z'),
      completedBy: OFFICE,
    },
  ],
  items: [
    { name: 'MOT', warnDays: 28, dueDate: '2026-12-01', lastDone: '2025-12-01' },
    { name: 'Tachograph calibration', warnDays: 28, dueDate: '2026-10-01', lastDone: undefined },
    { name: 'Safety inspection', warnDays: 7, dueDate: '2027-01-10', lastDone: '2026-11-01' },
  ],
  done: [
    {
      itemName: 'Safety inspection',
      doneOn: '2026-11-01',
      nextDue: '2027-01-10',
      note: 'Passed',
      doneBy: OFFICE,
      recordedAt: new Date('2026-11-01T15:00:00.000Z'),
    },
  ],
};

function setup(overrides: { vehicles?: VehicleDirectory; raw?: RawAuditData } = {}) {
  const scopes = new RecordingDataScopes();
  const calls: string[] = [];
  const deps: AuditDeps = {
    scopes,
    clock: new FakeClock('2026-11-08T12:00:00.000Z'),
    reader: {
      collect: (vehicleId, range) => {
        calls.push(`collect ${vehicleId} ${range.from}..${range.to}`);
        return Promise.resolve(overrides.raw ?? RAW);
      },
    },
    vehicles: overrides.vehicles ?? {
      find: (id) =>
        Promise.resolve(
          id === VEHICLE
            ? { id, companyId: COMPANY, name: 'Scania R450', registration: 'NX21ABC' }
            : null,
        ),
    },
    people: {
      driverLabel: (id) => Promise.resolve(id === DRIVER ? 'Sam Driver' : null),
      // Looked up on its own scope in the real thing, so it must never be reached from inside the caller's.
      staffNames: (companyId) =>
        scopes
          .run({ kind: 'company', companyId }, () =>
            Promise.resolve(new Map([[OFFICE, 'Pat Office']])),
          )
          .then((names) => names),
      companyName: (companyId) =>
        scopes.run({ kind: 'company', companyId }, () => Promise.resolve('Acme Haulage')),
    },
  };
  return { deps, scopes, calls };
}

describe('who may read the pack', () => {
  it('lets WagonWise staff, and a company person who manages the fleet, dispatches or sees reports', async () => {
    for (const caller of [
      ADMIN,
      fleet(['manage_fleet']),
      fleet(['dispatch']),
      fleet(['view_reports']),
    ]) {
      const { deps } = setup();
      expect((await getVehicleAuditPack(deps, caller, VEHICLE, {})).ok).toBe(true);
    }
  });

  it('refuses a company person with none of those, and reads nothing', async () => {
    const { deps, calls, scopes } = setup();
    const result = await getVehicleAuditPack(deps, fleet(['manage_maintenance']), VEHICLE, {});
    expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    expect(calls).toEqual([]);
    expect(scopes.used).toEqual([]);
  });

  it('says not found for an unknown vehicle and for another company’s, the same answer for both', async () => {
    const { deps } = setup();
    const unknown = await getVehicleAuditPack(
      deps,
      ADMIN,
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      {},
    );
    const theirs = await getVehicleAuditPack(deps, fleet(['view_reports'], OTHER), VEHICLE, {});
    expect(unknown).toEqual({ ok: false, error: { tag: 'NotFound' } });
    expect(theirs).toEqual({ ok: false, error: { tag: 'NotFound' } });
  });

  it('reads in the company’s own scope for a company person, and the platform scope for WagonWise staff', async () => {
    const mine = setup();
    await getVehicleAuditPack(mine.deps, fleet(['view_reports']), VEHICLE, {});
    expect(mine.scopes.used[0]).toEqual({ kind: 'company', companyId: COMPANY });
    const admin = setup();
    await getVehicleAuditPack(admin.deps, ADMIN, VEHICLE, {});
    expect(admin.scopes.used[0]).toEqual({ kind: 'platform' });
  });

  it('looks up the staff names after the read, never inside the caller’s scope', async () => {
    const { deps, scopes } = setup();
    const result = await getVehicleAuditPack(deps, ADMIN, VEHICLE, {});
    expect(result.ok).toBe(true);
    // RecordingDataScopes throws if a scope is opened inside another, so reaching here proves it.
    expect(scopes.used).toHaveLength(3);
  });
});

describe('the range', () => {
  const now = new Date('2026-11-08T12:00:00.000Z');

  it('is the last twelve months ending today when none is given', () => {
    expect(resolveRange(now, {})).toEqual({
      ok: true,
      value: { from: '2025-11-09', to: '2026-11-08' },
    });
  });

  it('takes the UK day, so a late evening in summer is still that day', () => {
    const lateJuly = new Date('2026-07-01T23:30:00.000Z');
    expect(resolveRange(lateJuly, {})).toMatchObject({ value: { to: '2026-07-02' } });
  });

  it('refuses a range that runs backwards, is not a date, or is longer than about two years', () => {
    expect(resolveRange(now, { from: '2026-11-08', to: '2026-11-01' }).ok).toBe(false);
    expect(resolveRange(now, { from: 'last week' }).ok).toBe(false);
    expect(resolveRange(now, { from: '2023-01-01', to: '2026-11-08' }).ok).toBe(false);
    expect(resolveRange(now, { from: '2025-01-01', to: '2026-11-08' }).ok).toBe(true);
  });

  it('is refused by the use case without reading anything', async () => {
    const { deps, calls } = setup();
    const result = await getVehicleAuditPack(deps, ADMIN, VEHICLE, {
      from: '2026-11-08',
      to: '2026-01-01',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidRange' } });
    expect(calls).toEqual([]);
  });
});

describe('itemState', () => {
  it('is overdue after the date, due soon inside the warning period, and fine before it', () => {
    expect(itemState({ dueDate: '2026-11-07', warnDays: 28 }, '2026-11-08')).toBe('overdue');
    expect(itemState({ dueDate: '2026-11-08', warnDays: 28 }, '2026-11-08')).toBe('due_soon');
    expect(itemState({ dueDate: '2026-12-06', warnDays: 28 }, '2026-11-08')).toBe('due_soon');
    expect(itemState({ dueDate: '2026-12-07', warnDays: 28 }, '2026-11-08')).toBe('ok');
  });
});

describe('the pack', () => {
  async function pack() {
    const { deps } = setup();
    const result = await getVehicleAuditPack(deps, ADMIN, VEHICLE, {
      from: '2026-10-01',
      to: '2026-11-08',
    });
    if (!result.ok) throw new Error('no pack');
    return result.value;
  }

  it('names the vehicle and counts what happened, newest records not leaking from outside the period', async () => {
    const { vehicle, pack: p } = await pack();
    expect(vehicle).toEqual({
      id: VEHICLE,
      name: 'Scania R450',
      registration: 'NX21ABC',
      company: 'Acme Haulage',
    });
    expect(p.range).toEqual({ from: '2026-10-01', to: '2026-11-08' });
    expect(p.summary).toEqual({
      checks: 2,
      clear: 1,
      advisory: 0,
      doNotDrive: 1,
      // The old wiper defect is listed because it is not fixed, but it was found before this period.
      defectsFound: 1,
      defectsNotFixed: 1,
      maintenanceDone: 1,
      maintenanceOverdue: 1,
    });
  });

  it('lists the checks oldest first, with the driver’s name', async () => {
    const { pack: p } = await pack();
    expect(p.checks.map((c) => [c.day, c.who, c.result, c.defects])).toEqual([
      ['2026-11-02', 'Sam Driver', 'clear', 0],
      ['2026-11-03', 'Sam Driver', 'do_not_drive', 1],
    ]);
  });

  it('joins a defect to its repair, and names who did what, saying plainly when someone has left', async () => {
    const { pack: p } = await pack();
    const brake = p.defects.find((d) => d.id === 'd1');
    expect(brake).toMatchObject({
      foundBy: 'Sam Driver',
      status: 'fixed',
      lastChangeBy: 'Someone no longer on the account',
      repair: {
        title: 'Replace brake light',
        bookedBy: 'Pat Office',
        finishedBy: 'Pat Office',
        status: 'done',
      },
    });
    const wiper = p.defects.find((d) => d.id === 'd-old');
    expect(wiper).toMatchObject({
      foundBy: 'A driver',
      lastChangeBy: 'Pat Office',
      repair: undefined,
    });
  });

  it('puts maintenance in order with where each date stands today', async () => {
    const { pack: p } = await pack();
    expect(p.maintenance.items.map((i) => [i.name, i.state])).toEqual([
      ['Tachograph calibration', 'overdue'],
      ['MOT', 'due_soon'],
      ['Safety inspection', 'ok'],
    ]);
    expect(p.maintenance.done).toEqual([
      expect.objectContaining({
        item: 'Safety inspection',
        doneOn: '2026-11-01',
        by: 'Pat Office',
      }),
    ]);
  });

  it('sets every record in one timeline, oldest first', async () => {
    const { pack: p } = await pack();
    expect(p.timeline.map((e) => e.kind)).toEqual([
      'defect_found', // the old wiper defect, 1 September
      'defect_changed',
      'maintenance_done', // 1 November
      'check', // 2 November
      'check', // 3 November
      'defect_found',
      'repair_booked',
      'defect_changed', // 4 November 10:00, the same moment the repair finished
      'repair_finished',
    ]);
    const times = p.timeline.map((e) => e.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(p.timeline.find((e) => e.kind === 'check' && e.detail !== undefined)).toMatchObject({
      title: 'Walk-round check, Daily walk-round: do not drive',
      detail: '1 defect found',
      who: 'Sam Driver',
    });
    expect(
      p.timeline.find((e) => e.kind === 'defect_found' && e.who === 'Sam Driver'),
    ).toMatchObject({
      title: 'Defect found: Nearside brake light (do not drive)',
      detail: 'Not working · Bulb gone',
    });
  });

  it('writes days the way the portal does, not as 2026-11-04', async () => {
    const { pack: p } = await pack();
    expect(p.timeline.find((e) => e.kind === 'maintenance_done')).toMatchObject({
      title: 'Safety inspection done on 1 Nov 2026',
      detail: 'Next due 10 Jan 2027 · Passed',
    });
    expect(p.timeline.find((e) => e.kind === 'repair_booked')).toMatchObject({
      detail: 'Due 4 Nov 2026',
    });
    expect(p.timeline.find((e) => e.kind === 'repair_finished')).toMatchObject({
      detail: 'Done on 4 Nov 2026 · New bulb fitted',
    });
  });
});
