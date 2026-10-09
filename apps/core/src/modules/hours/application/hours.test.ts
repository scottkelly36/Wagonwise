import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import {
  clearMyStatus,
  getFirmSetting,
  listMySharing,
  listStatuses,
  pruneStale,
  reportStatus,
  setFirmSetting,
  setMySharing,
  type HoursDeps,
} from './hours.js';
import type { StaffCaller } from './ports.js';
import {
  FakeActiveJobs,
  FakeDriverCompanies,
  InMemorySettings,
  InMemorySharing,
  InMemoryStatuses,
} from './testing/in-memory.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const sam = makeId<'DriverId'>('d0000000-0000-4000-8000-000000000001');
const kim = makeId<'DriverId'>('d0000000-0000-4000-8000-000000000002');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');

const manager: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_fleet'] };
const dispatcher: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const outsider: StaffCaller = { kind: 'fleet', companyId: beta, privileges: ['manage_fleet'] };
const admin: StaffCaller = { kind: 'platform' };

const live = { state: 'driving', drivingLeftMin: 80, next: 'break' } as const;

function setup() {
  const settings = new InMemorySettings();
  const sharing = new InMemorySharing();
  const statuses = new InMemoryStatuses();
  const companies = new FakeDriverCompanies();
  const jobs = new FakeActiveJobs();
  companies.byDriver.set(sam, [{ id: acme, name: 'Acme Haulage' }]);
  companies.byDriver.set(kim, [{ id: acme, name: 'Acme Haulage' }]);
  jobs.onJob.set(sam, acme);
  jobs.onJob.set(kim, acme);
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: HoursDeps = { settings, sharing, statuses, companies, jobs, clock };
  return { deps, settings, sharing, statuses, companies, jobs, clock };
}

describe('the firm’s switch', () => {
  it('is off until a manager (or WagonWise) turns it on, and others cannot', async () => {
    const { deps } = setup();
    expect(await getFirmSetting(deps, dispatcher, acme)).toEqual({ ok: true, value: false });
    expect(await setFirmSetting(deps, dispatcher, staffId, acme, true)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await setFirmSetting(deps, outsider, staffId, acme, true)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await setFirmSetting(deps, manager, staffId, acme, true)).ok).toBe(true);
    expect(await getFirmSetting(deps, dispatcher, acme)).toEqual({ ok: true, value: true });
    expect((await setFirmSetting(deps, admin, staffId, acme, false)).ok).toBe(true);
    expect(await getFirmSetting(deps, outsider, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('removes every status the company holds when it is turned off', async () => {
    const s = setup();
    await setFirmSetting(s.deps, manager, staffId, acme, true);
    await setMySharing(s.deps, sam, 'sam@x', acme, true);
    await reportStatus(s.deps, sam, live);
    expect(s.statuses.rows.size).toBe(1);
    await setFirmSetting(s.deps, manager, staffId, acme, false);
    expect(s.statuses.rows.size).toBe(0);
  });
});

describe('the driver’s choice', () => {
  it('lists the companies the driver drives for, with both switches', async () => {
    const s = setup();
    expect(await listMySharing(s.deps, sam, 'sam@x')).toEqual([
      { companyId: acme, companyName: 'Acme Haulage', firmEnabled: false, sharing: false },
    ]);
    await setFirmSetting(s.deps, manager, staffId, acme, true);
    await setMySharing(s.deps, sam, 'sam@x', acme, true);
    expect((await listMySharing(s.deps, sam, 'sam@x'))[0]).toMatchObject({
      firmEnabled: true,
      sharing: true,
    });
  });

  it('cannot agree until the firm has switched the feature on, or for a company they do not drive for', async () => {
    const s = setup();
    expect(await setMySharing(s.deps, sam, 'sam@x', acme, true)).toEqual({
      ok: false,
      error: { tag: 'FirmNotEnabled' },
    });
    expect(await setMySharing(s.deps, sam, 'sam@x', beta, true)).toEqual({
      ok: false,
      error: { tag: 'CompanyNotFound' },
    });
    expect(s.sharing.rows.size).toBe(0);
  });

  it('records the wording version agreed to, and stopping removes their status at once', async () => {
    const s = setup();
    await setFirmSetting(s.deps, manager, staffId, acme, true);
    await setMySharing(s.deps, sam, 'sam@x', acme, true, 1);
    expect([...s.sharing.rows.values()][0]?.wordingVersion).toBe(1);
    await reportStatus(s.deps, sam, live);
    expect(s.statuses.rows.size).toBe(1);
    expect(await setMySharing(s.deps, sam, 'sam@x', acme, false)).toEqual({
      ok: true,
      value: false,
    });
    expect(s.statuses.rows.size).toBe(0);
    expect(await s.sharing.isSharing(acme, sam)).toBe(false);
  });

  it('can still stop sharing with a company they have left', async () => {
    const s = setup();
    await setFirmSetting(s.deps, manager, staffId, acme, true);
    await setMySharing(s.deps, sam, 'sam@x', acme, true);
    await reportStatus(s.deps, sam, live);
    s.companies.byDriver.set(sam, []);
    expect(await setMySharing(s.deps, sam, 'sam@x', acme, false)).toEqual({
      ok: true,
      value: false,
    });
    expect(s.statuses.rows.size).toBe(0);
    expect(s.sharing.rows.size).toBe(0);
  });
});

describe('reporting a status', () => {
  async function sharingSetup() {
    const s = setup();
    await setFirmSetting(s.deps, manager, staffId, acme, true);
    await setMySharing(s.deps, sam, 'sam@x', acme, true);
    return s;
  }

  it('stores the latest status, replacing the one before, with no history', async () => {
    const s = await sharingSetup();
    expect((await reportStatus(s.deps, sam, live)).ok).toBe(true);
    s.clock.set('2026-10-09T09:30:00.000Z');
    await reportStatus(s.deps, sam, { state: 'on_break', drivingLeftMin: 270, next: 'break' });
    expect(s.statuses.rows.size).toBe(1);
    expect([...s.statuses.rows.values()][0]).toMatchObject({
      state: 'on_break',
      drivingLeftMin: 270,
    });
  });

  it('stores nothing unless both switches are on and the driver is on a job', async () => {
    const s = setup();
    // The firm has it off.
    await s.sharing.set(acme, sam, true, 1, s.clock.now());
    expect(await reportStatus(s.deps, sam, live)).toEqual({
      ok: false,
      error: { tag: 'NotSharing' },
    });
    // The firm is on but this driver has not chosen.
    await setFirmSetting(s.deps, manager, staffId, acme, true);
    expect(await reportStatus(s.deps, kim, live)).toEqual({
      ok: false,
      error: { tag: 'NotSharing' },
    });
    // Sharing but not on a job.
    s.jobs.onJob.delete(sam);
    expect(await reportStatus(s.deps, sam, live)).toEqual({
      ok: false,
      error: { tag: 'NotOnAJob' },
    });
    expect(s.statuses.rows.size).toBe(0);
  });

  it('refuses a status that is not one of the three, or minutes out of range', async () => {
    const s = await sharingSetup();
    expect((await reportStatus(s.deps, sam, { ...live, state: 'resting' })).ok).toBe(false);
    expect((await reportStatus(s.deps, sam, { ...live, drivingLeftMin: -1 })).ok).toBe(false);
    expect((await reportStatus(s.deps, sam, { ...live, drivingLeftMin: 1.5 })).ok).toBe(false);
    expect((await reportStatus(s.deps, sam, { ...live, next: 'later' })).ok).toBe(false);
    expect(s.statuses.rows.size).toBe(0);
  });

  it('keeps the break figures the phone sends, and refuses nonsense ones', async () => {
    const s = await sharingSetup();
    const withBreaks = { ...live, breakMin: 45, stretchMin: 270, untilLimitMin: 400 };
    expect((await reportStatus(s.deps, sam, withBreaks)).ok).toBe(true);
    expect([...s.statuses.rows.values()][0]).toMatchObject({
      breakMin: 45,
      stretchMin: 270,
      untilLimitMin: 400,
    });
    expect((await reportStatus(s.deps, sam, { ...live, breakMin: -5 })).ok).toBe(false);
    expect((await reportStatus(s.deps, sam, { ...live, stretchMin: 1.5 })).ok).toBe(false);
    expect((await reportStatus(s.deps, sam, { ...live, untilLimitMin: 5000 })).ok).toBe(false);
  });

  it('clears the driver’s status when they finish', async () => {
    const s = await sharingSetup();
    await reportStatus(s.deps, sam, live);
    await clearMyStatus(s.deps, sam);
    expect(s.statuses.rows.size).toBe(0);
  });
});

describe('showing the office', () => {
  it('shows sharing drivers on a job now, within 12 hours, and nothing when the firm has it off', async () => {
    const s = setup();
    await setFirmSetting(s.deps, manager, staffId, acme, true);
    await setMySharing(s.deps, sam, 'sam@x', acme, true);
    await setMySharing(s.deps, kim, 'kim@x', acme, true);
    await reportStatus(s.deps, sam, live);
    await reportStatus(s.deps, kim, { state: 'working', drivingLeftMin: 200, next: 'break' });

    const shown = await listStatuses(s.deps, dispatcher, acme);
    expect(shown.ok && shown.value.map((x) => x.driverId).sort()).toEqual([kim, sam].sort());

    // Kim's job ends: no longer shown, even though the row has not been cleaned up yet.
    s.jobs.onJob.delete(kim);
    const afterJob = await listStatuses(s.deps, dispatcher, acme);
    expect(afterJob.ok && afterJob.value.map((x) => x.driverId)).toEqual([sam]);

    // Sam's goes stale.
    s.clock.set('2026-10-09T21:30:00.000Z');
    const stale = await listStatuses(s.deps, dispatcher, acme);
    expect(stale.ok && stale.value).toEqual([]);

    // Switched off: nothing, even for a fresh status.
    s.clock.set('2026-10-09T09:10:00.000Z');
    await s.settings.set(acme, false, staffId, s.clock.now());
    const off = await listStatuses(s.deps, dispatcher, acme);
    expect(off.ok && off.value).toEqual([]);
  });

  it('is for the company’s own staff and WagonWise only', async () => {
    const s = setup();
    expect(await listStatuses(s.deps, outsider, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await listStatuses(s.deps, admin, acme)).ok).toBe(true);
  });

  it('deletes statuses not updated for 12 hours', async () => {
    const s = setup();
    await setFirmSetting(s.deps, manager, staffId, acme, true);
    await setMySharing(s.deps, sam, 'sam@x', acme, true);
    await reportStatus(s.deps, sam, live);
    s.clock.set('2026-10-09T20:00:00.000Z');
    expect(await pruneStale(s.deps)).toBe(0);
    s.clock.set('2026-10-09T21:01:00.000Z');
    expect(await pruneStale(s.deps)).toBe(1);
    expect(s.statuses.rows.size).toBe(0);
  });
});
