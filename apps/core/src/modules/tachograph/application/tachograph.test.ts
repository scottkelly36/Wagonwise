import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { StaffCaller } from './ports.js';
import {
  deleteFile,
  downloadFile,
  listFiles,
  listMine,
  sendMyFile,
  setFirmSettings,
  uploadFile,
  type TachographDeps,
} from './tachograph.js';
import {
  InMemoryDriverCompanies,
  InMemoryFiles,
  InMemoryRoster,
  InMemorySettings,
} from './testing/in-memory.js';

const ACME = makeId<'CompanyId'>('acme');
const BETA = makeId<'CompanyId'>('beta');
const SAM = makeId<'DriverId'>('sam');
const STAFF = makeId<'StaffId'>('staff-1');
const manager: StaffCaller = { kind: 'fleet', companyId: ACME, privileges: ['manage_fleet'] };
const dispatcher: StaffCaller = { kind: 'fleet', companyId: ACME, privileges: ['dispatch'] };
const rival: StaffCaller = { kind: 'fleet', companyId: BETA, privileges: ['manage_fleet'] };

const bytes = Buffer.from([0, 1, 2, 3, 250, 251]);
const b64 = bytes.toString('base64');

function build(options: { paused?: boolean } = {}) {
  let n = 0;
  const deps = {
    settings: new InMemorySettings(),
    files: new InMemoryFiles(),
    companies: new InMemoryDriverCompanies(),
    roster: new InMemoryRoster(),
    accounts: { pausedCompanyName: () => Promise.resolve(options.paused === true ? 'Acme' : null) },
    ids: { newId: () => `file-${++n}` },
    clock: new FakeClock('2026-11-26T10:00:00.000Z'),
  } satisfies TachographDeps;
  deps.companies.byDriver.set(SAM, [{ id: ACME, name: 'Acme Haulage' }]);
  deps.roster.drivers.add(`${ACME}|${SAM}`);
  deps.roster.vehicles.add(`${ACME}|veh-1`);
  return deps;
}

const card = {
  kind: 'driver_card',
  driverId: SAM,
  fileName: 'C_sam.DDD',
  downloadedOn: '2026-11-20',
  dataBase64: b64,
} as const;

describe('the office uploads a file', () => {
  it('keeps the bytes exactly as sent, with their SHA-256 and the name, for a driver of the company', async () => {
    const deps = build();
    const r = await uploadFile(deps, manager, STAFF, ACME, card);
    expect(r).toEqual({ ok: true, value: { duplicate: false } });
    const stored = deps.files.stored[0];
    expect(stored?.data.equals(bytes)).toBe(true);
    expect(stored?.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(stored?.fileName).toBe('C_sam.DDD');
    expect(stored?.uploadedByStaffId).toBe(STAFF);
  });

  it('takes a vehicle unit file for one of the company vehicles', async () => {
    const deps = build();
    const r = await uploadFile(deps, manager, STAFF, ACME, {
      kind: 'vehicle_unit',
      vehicleId: 'veh-1',
      fileName: 'V_ab12.ddd',
      downloadedOn: '2026-11-01',
      dataBase64: b64,
    });
    expect(r.ok).toBe(true);
    expect(deps.files.stored[0]?.kind).toBe('vehicle_unit');
  });

  it('refuses a driver who is not one of the company, and a vehicle that is not one of its own', async () => {
    const deps = build();
    expect(
      await uploadFile(deps, manager, STAFF, ACME, { ...card, driverId: 'someone-else' }),
    ).toEqual({
      ok: false,
      error: { tag: 'SubjectNotFound' },
    });
    expect(
      await uploadFile(deps, manager, STAFF, ACME, {
        kind: 'vehicle_unit',
        vehicleId: 'veh-9',
        fileName: 'v.ddd',
        downloadedOn: '2026-11-01',
        dataBase64: b64,
      }),
    ).toEqual({ ok: false, error: { tag: 'SubjectNotFound' } });
    expect(deps.files.stored).toHaveLength(0);
  });

  it('is for whoever manages the fleet of that company, and no one else', async () => {
    const deps = build();
    for (const caller of [dispatcher, rival]) {
      expect(await uploadFile(deps, caller, STAFF, ACME, card)).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
      expect(await listFiles(deps, caller, ACME)).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
    expect((await uploadFile(deps, { kind: 'platform' }, STAFF, ACME, card)).ok).toBe(true);
  });

  it('keeps one copy of the same file, and says so', async () => {
    const deps = build();
    await uploadFile(deps, manager, STAFF, ACME, card);
    const again = await uploadFile(deps, manager, STAFF, ACME, {
      ...card,
      downloadedOn: '2026-11-25',
    });
    expect(again).toEqual({ ok: true, value: { duplicate: true } });
    expect(deps.files.stored).toHaveLength(1);
    expect(deps.files.stored[0]?.downloadedOn).toBe('2026-11-20');
  });

  it.each([
    ['an empty file', { dataBase64: '' }, 'empty'],
    ['a date in the future', { downloadedOn: '2026-12-25' }, 'bad_date'],
    ['a date that does not exist', { downloadedOn: '2026-02-30' }, 'bad_date'],
    ['a blank name', { fileName: ' / ' }, 'bad_name'],
  ])('refuses %s', async (_what, change, reason) => {
    const deps = build();
    expect(await uploadFile(deps, manager, STAFF, ACME, { ...card, ...change })).toEqual({
      ok: false,
      error: { tag: 'InvalidFile', reason },
    });
  });

  it('refuses a file over the size limit', async () => {
    const deps = build();
    const big = Buffer.alloc(6_000_001, 1).toString('base64');
    expect(await uploadFile(deps, manager, STAFF, ACME, { ...card, dataBase64: big })).toEqual({
      ok: false,
      error: { tag: 'InvalidFile', reason: 'too_big' },
    });
  });

  it('keeps only the name of the file, not folders or control characters', async () => {
    const deps = build();
    await uploadFile(deps, manager, STAFF, ACME, {
      ...card,
      fileName: 'C:\\Users\\sam\\Downloads\\sam\u0007.DDD',
    });
    expect(deps.files.stored[0]?.fileName).toBe('sam.DDD');
  });
});

describe('the office reads and removes files', () => {
  it('lists the newest file for each card and unit, and the recent files', async () => {
    const deps = build();
    await uploadFile(deps, manager, STAFF, ACME, card);
    await uploadFile(deps, manager, STAFF, ACME, {
      ...card,
      downloadedOn: '2026-11-24',
      dataBase64: Buffer.from('newer').toString('base64'),
    });
    const r = await listFiles(deps, manager, ACME);
    expect(r.ok && r.value.latest.map((f) => f.downloadedOn)).toEqual(['2026-11-24']);
    expect(r.ok && r.value.recent).toHaveLength(2);
  });

  it('gives back the file as received, and deletes it', async () => {
    const deps = build();
    await uploadFile(deps, manager, STAFF, ACME, card);
    const id = deps.files.stored[0]?.id ?? '';
    const got = await downloadFile(deps, manager, ACME, id);
    expect(got.ok && got.value.data.equals(bytes)).toBe(true);
    expect(await downloadFile(deps, rival, ACME, id)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await deleteFile(deps, manager, ACME, id)).toEqual({ ok: true, value: undefined });
    expect(await deleteFile(deps, manager, ACME, id)).toEqual({
      ok: false,
      error: { tag: 'FileNotFound' },
    });
  });
});

describe('a driver sends their own card file', () => {
  const send = {
    fileName: 'C_sam.DDD',
    downloadedOn: '2026-11-25',
    dataBase64: b64,
    wordingVersion: 1,
  };

  it("is turned away until the firm has switched it on, then goes to that firm as the driver's own file", async () => {
    const deps = build();
    expect(await sendMyFile(deps, SAM, 'sam@example.com', ACME, send)).toEqual({
      ok: false,
      error: { tag: 'FirmNotEnabled' },
    });
    await setFirmSettings(deps, manager, STAFF, ACME, {
      driversMaySend: true,
      retentionMonths: 12,
    });
    expect(await sendMyFile(deps, SAM, 'sam@example.com', ACME, send)).toEqual({
      ok: true,
      value: { duplicate: false },
    });
    const stored = deps.files.stored[0];
    expect(stored).toMatchObject({
      kind: 'driver_card',
      driverId: SAM,
      uploadedByDriverId: SAM,
      wordingVersion: 1,
    });
  });

  it('only goes to a firm the driver drives for', async () => {
    const deps = build();
    await setFirmSettings(deps, rival, STAFF, BETA, { driversMaySend: true, retentionMonths: 12 });
    expect(await sendMyFile(deps, SAM, 'sam@example.com', BETA, send)).toEqual({
      ok: false,
      error: { tag: 'CompanyNotFound' },
    });
  });

  it('is held back for a paused firm', async () => {
    const deps = build({ paused: true });
    await setFirmSettings(deps, manager, STAFF, ACME, {
      driversMaySend: true,
      retentionMonths: 12,
    });
    expect((await sendMyFile(deps, SAM, 'sam@example.com', ACME, send)).ok).toBe(false);
  });

  it('shows each firm, whether it takes files, and the day of the last file sent', async () => {
    const deps = build();
    await setFirmSettings(deps, manager, STAFF, ACME, {
      driversMaySend: true,
      retentionMonths: 12,
    });
    expect(await listMine(deps, SAM, 'sam@example.com')).toEqual([
      {
        companyId: ACME,
        companyName: 'Acme Haulage',
        firmEnabled: true,
        lastDownloadedOn: undefined,
      },
    ]);
    await sendMyFile(deps, SAM, 'sam@example.com', ACME, send);
    expect((await listMine(deps, SAM, 'sam@example.com'))[0]?.lastDownloadedOn).toBe('2026-11-25');
  });
});
