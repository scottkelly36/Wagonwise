import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { CheckDetail, DefectRecord } from '../domain/office.js';
import {
  getCheckPhoto,
  getCheckResult,
  listCheckResults,
  listCompanyDefects,
  setDefectStatus,
  type OfficeCheckDeps,
} from './office-checks.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryOfficeCheckRepository } from './testing/in-memory-office-check-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');

const dispatcher: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const reporter: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['view_reports'] };
const nobody: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['view_live_map'] };
const outsider: StaffCaller = { kind: 'fleet', companyId: beta, privileges: ['manage_fleet'] };
const admin: StaffCaller = { kind: 'platform' };

function defect(id: string, over: Partial<DefectRecord> = {}): DefectRecord {
  return {
    id,
    checkId: makeId<'CheckId'>('c1'),
    companyId: acme,
    vehicleId: makeId<'FleetVehicleId'>('lorry-1'),
    vehicleName: 'Big Wagon',
    itemId: 'tyres',
    label: 'Tyres',
    severity: 'do_not_drive',
    detail: 'Flagged as a defect',
    note: undefined,
    status: 'open',
    createdAt: new Date('2026-10-09T08:00:00.000Z'),
    statusChangedAt: undefined,
    statusChangedBy: undefined,
    ...over,
  };
}

function check(
  id: string,
  day: string,
  defects: DefectRecord[] = [],
  over: Partial<CheckDetail> = {},
): CheckDetail {
  return {
    id: makeId<'CheckId'>(id),
    companyId: acme,
    templateId: makeId<'CheckTemplateId'>('t1'),
    templateVersion: 2,
    templateName: 'Tractor unit',
    vehicleId: makeId<'FleetVehicleId'>('lorry-1'),
    vehicleName: 'Big Wagon',
    driverId: makeId<'DriverId'>('d1'),
    checkDay: day,
    items: [],
    answers: [],
    result: defects.length > 0 ? 'do_not_drive' : 'clear',
    defects,
    photoItemIds: [],
    submittedAt: new Date(`${day}T08:00:00.000Z`),
    deviceCompletedAt: undefined,
    ...over,
  };
}

function setup() {
  const office = new InMemoryOfficeCheckRepository();
  const clock = new FakeClock('2026-10-09T12:00:00.000Z');
  const deps: OfficeCheckDeps = { office, clock };
  office.add(
    check('c1', '2026-10-09', [
      defect('d1'),
      defect('d2', { severity: 'advisory', label: 'Wipers' }),
    ]),
  );
  office.add(check('c2', '2026-10-05'));
  office.add(check('c3', '2026-09-01'));
  office.add(check('c4', '2026-10-09', [defect('d9', { companyId: beta })], { companyId: beta }));
  return { deps, office };
}

describe('listCheckResults', () => {
  it('lists the last week by default, newest first, and counts the defects', async () => {
    const { deps } = setup();
    const result = await listCheckResults(deps, dispatcher, acme, {});
    expect(result.ok && result.value.map((c) => [c.id, c.defectCount])).toEqual([
      ['c1', 2],
      ['c2', 0],
    ]);
  });

  it('takes a range of UK days, both ends included', async () => {
    const { deps } = setup();
    const result = await listCheckResults(deps, dispatcher, acme, {
      from: '2026-09-01',
      to: '2026-10-05',
    });
    expect(result.ok && result.value.map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  it('refuses a range that runs backwards, is over a year long, or is not a date', async () => {
    const { deps } = setup();
    for (const range of [
      { from: '2026-10-09', to: '2026-10-01' },
      { from: '2025-01-01', to: '2026-10-09' },
      { from: 'last week', to: '2026-10-09' },
    ]) {
      expect(await listCheckResults(deps, dispatcher, acme, range)).toEqual({
        ok: false,
        error: { tag: 'InvalidRange' },
      });
    }
  });

  it('is for fleet managers, dispatchers, report viewers and WagonWise: not other staff or other companies', async () => {
    const { deps } = setup();
    for (const caller of [dispatcher, reporter, admin]) {
      expect((await listCheckResults(deps, caller, acme, {})).ok).toBe(true);
    }
    for (const caller of [nobody, outsider]) {
      expect(await listCheckResults(deps, caller, acme, {})).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });
});

describe('getCheckResult and getCheckPhoto', () => {
  it('shows a check in full, and a photo it has', async () => {
    const { deps, office } = setup();
    office.add(check('c5', '2026-10-09', [], { photoItemIds: ['load'] }), {
      load: {
        contentType: 'image/jpeg',
        dataBase64: 'AAAA',
        capturedAt: new Date('2026-10-09T08:05:00.000Z'),
      },
    });
    const one = await getCheckResult(deps, dispatcher, makeId<'CheckId'>('c5'));
    expect(one.ok && one.value.templateVersion).toBe(2);
    const photo = await getCheckPhoto(deps, dispatcher, makeId<'CheckId'>('c5'), 'load');
    expect(photo.ok && photo.value.dataBase64).toBe('AAAA');
    expect(await getCheckPhoto(deps, dispatcher, makeId<'CheckId'>('c5'), 'ghost')).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });

  it('hides another company’s check as not found, and refuses own-company staff without access', async () => {
    const { deps } = setup();
    expect(await getCheckResult(deps, outsider, makeId<'CheckId'>('c1'))).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    expect(await getCheckResult(deps, nobody, makeId<'CheckId'>('c1'))).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await getCheckResult(deps, admin, makeId<'CheckId'>('nope'))).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });
});

describe('defects', () => {
  it('lists those still to deal with, most serious first, and filters by status', async () => {
    const { deps } = setup();
    const open = await listCompanyDefects(deps, dispatcher, acme, undefined);
    expect(open.ok && open.value.map((d) => d.id)).toEqual(['d1', 'd2']);
    await setDefectStatus(deps, dispatcher, staffId, 'd2', 'fixed');
    const stillOpen = await listCompanyDefects(deps, dispatcher, acme, undefined);
    expect(stillOpen.ok && stillOpen.value.map((d) => d.id)).toEqual(['d1']);
    const fixed = await listCompanyDefects(deps, dispatcher, acme, 'fixed');
    expect(fixed.ok && fixed.value.map((d) => d.id)).toEqual(['d2']);
  });

  it('moves a defect through acknowledged and fixed, noting who and when, and lets it be reopened', async () => {
    const { deps } = setup();
    const acknowledged = await setDefectStatus(deps, dispatcher, staffId, 'd1', 'acknowledged');
    expect(acknowledged.ok && acknowledged.value).toMatchObject({
      status: 'acknowledged',
      statusChangedBy: staffId,
      statusChangedAt: new Date('2026-10-09T12:00:00.000Z'),
    });
    expect((await setDefectStatus(deps, dispatcher, staffId, 'd1', 'fixed')).ok).toBe(true);
    const reopened = await setDefectStatus(deps, dispatcher, staffId, 'd1', 'open');
    expect(reopened.ok && reopened.value.status).toBe('open');
  });

  it('refuses a report viewer and other staff changing a defect, but lets a viewer read', async () => {
    const { deps } = setup();
    expect((await listCompanyDefects(deps, reporter, acme, undefined)).ok).toBe(true);
    for (const caller of [reporter, nobody]) {
      expect(await setDefectStatus(deps, caller, staffId, 'd1', 'fixed')).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });

  it('hides another company’s defects, and refuses to list them', async () => {
    const { deps } = setup();
    expect(await setDefectStatus(deps, outsider, staffId, 'd1', 'fixed')).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    expect(await listCompanyDefects(deps, outsider, acme, undefined)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await setDefectStatus(deps, admin, staffId, 'nope', 'fixed')).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });
});
