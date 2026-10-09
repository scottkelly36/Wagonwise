import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { ItemTypeInput, VehicleSummary } from '../domain/maintenance.js';
import {
  archiveItemType,
  createItemType,
  listItemTypes,
  starterItemTypes,
  updateItemType,
  type ItemTypeDeps,
} from './item-types.js';
import type { StaffCaller } from './ports/directories.js';
import {
  maintenanceOverview,
  markDone,
  setDueDate,
  vehicleMaintenance,
  type ScheduleDeps,
} from './schedule.js';
import { InMemoryItemTypeRepository } from './testing/in-memory-item-type-repository.js';
import { InMemoryScheduleRepository } from './testing/in-memory-schedule-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const van = makeId<'FleetVehicleId'>('van');
const lorry = makeId<'FleetVehicleId'>('lorry');
const theirs = makeId<'FleetVehicleId'>('theirs');
const motId = makeId<'MaintenanceItemId'>('mot');

const booker: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_maintenance'] };
const dispatcher: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const nobody: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['view_live_map'] };
const outsider: StaffCaller = {
  kind: 'fleet',
  companyId: beta,
  privileges: ['manage_maintenance'],
};
const admin: StaffCaller = { kind: 'platform' };

const input: ItemTypeInput = {
  name: 'MOT',
  intervalValue: 12,
  intervalUnit: 'months',
  warnDays: 28,
  appliesTo: 'all',
  vehicleIds: [],
};

function setup() {
  const items = new InMemoryItemTypeRepository();
  const schedules = new InMemoryScheduleRepository();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const vehicles = {
    listForCompany: (c: typeof acme) =>
      Promise.resolve(
        c === acme
          ? ([
              { id: van, name: 'Van', registration: 'AB12CDE' },
              { id: lorry, name: 'Lorry', registration: undefined },
            ] as VehicleSummary[])
          : [],
      ),
    find: (v: typeof van) =>
      Promise.resolve(
        v === van
          ? { id: van, name: 'Van', registration: 'AB12CDE', companyId: acme }
          : v === lorry
            ? { id: lorry, name: 'Lorry', registration: undefined, companyId: acme }
            : v === theirs
              ? { id: theirs, name: 'Theirs', registration: undefined, companyId: beta }
              : null,
      ),
  };
  const deps: ScheduleDeps & ItemTypeDeps = {
    items,
    schedules,
    vehicles,
    clock,
    ids: new SequentialIdGenerator(),
  };
  return { deps, items, schedules, clock };
}

async function withMot(deps: ItemTypeDeps) {
  const made = await createItemType(deps, booker, { ...input, id: motId, companyId: acme });
  if (!made.ok) throw new Error('setup');
}

describe('the items a firm tracks', () => {
  it('lets whoever has manage_maintenance (or WagonWise) create, change and archive them', async () => {
    const { deps } = setup();
    expect((await createItemType(deps, booker, { ...input, id: motId, companyId: acme })).ok).toBe(
      true,
    );
    const changed = await updateItemType(deps, booker, motId, { ...input, warnDays: 42 });
    expect(changed.ok && changed.value.warnDays).toBe(42);
    expect((await archiveItemType(deps, admin, motId)).ok).toBe(true);
    const listed = await listItemTypes(deps, booker, acme);
    expect(listed.ok && listed.value).toEqual([]);
  });

  it('shows them to those who run the fleet or see reports, and to nobody else', async () => {
    const { deps } = setup();
    await withMot(deps);
    for (const caller of [booker, dispatcher, admin]) {
      const r = await listItemTypes(deps, caller, acme);
      expect(r.ok && r.value).toHaveLength(1);
    }
    for (const caller of [nobody, outsider]) {
      expect(await listItemTypes(deps, caller, acme)).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });

  it('refuses anyone without manage_maintenance to change them, and an unknown item as not found', async () => {
    const { deps } = setup();
    await withMot(deps);
    expect(await updateItemType(deps, dispatcher, motId, input)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await updateItemType(deps, outsider, motId, input)).toEqual({
      ok: false,
      error: { tag: 'ItemNotFound' },
    });
    expect(await archiveItemType(deps, booker, makeId<'MaintenanceItemId'>('nope'))).toEqual({
      ok: false,
      error: { tag: 'ItemNotFound' },
    });
  });

  it('refuses a vehicle that is not the company’s, and an item that makes no sense', async () => {
    const { deps } = setup();
    expect(
      await createItemType(deps, booker, {
        ...input,
        appliesTo: 'selected',
        vehicleIds: [theirs],
        id: motId,
        companyId: acme,
      }),
    ).toEqual({ ok: false, error: { tag: 'VehicleNotInCompany' } });
    expect(
      await createItemType(deps, booker, {
        ...input,
        intervalValue: 0,
        id: motId,
        companyId: acme,
      }),
    ).toEqual({ ok: false, error: { tag: 'InvalidItemType', reason: 'interval' } });
  });

  it('answers a retry with the item already made', async () => {
    const { deps } = setup();
    await withMot(deps);
    const again = await createItemType(deps, booker, {
      ...input,
      name: 'Changed',
      id: motId,
      companyId: acme,
    });
    expect(again.ok && again.value.name).toBe('MOT');
  });

  it('offers an example list to start from', () => {
    expect(starterItemTypes().map((s) => s.name)).toContain('MOT');
  });
});

describe('dates on a vehicle', () => {
  it('sets when an item is next due, and the overview shows it with its status, most urgent first', async () => {
    const { deps } = setup();
    await withMot(deps);
    await setDueDate(deps, booker, staffId, van, motId, '2026-10-01');
    await setDueDate(deps, booker, staffId, lorry, motId, '2027-06-01');
    const overview = await maintenanceOverview(deps, dispatcher, acme);
    expect(overview.ok && overview.value.map((r) => [r.vehicleName, r.status])).toEqual([
      ['Van', 'overdue'],
      ['Lorry', 'ok'],
    ]);
  });

  it('marks work done: records it, and moves the next due date on by the interval', async () => {
    const { deps, schedules } = setup();
    await withMot(deps);
    await setDueDate(deps, booker, staffId, van, motId, '2026-10-01');
    const done = await markDone(deps, booker, staffId, van, motId, {
      doneOn: '2026-10-08',
      note: ' Passed, no advisories ',
    });
    expect(done.ok && done.value).toMatchObject({ dueDate: '2027-10-08', lastDone: '2026-10-08' });
    const history = await schedules.listHistory(van);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      itemName: 'MOT',
      doneOn: '2026-10-08',
      nextDue: '2027-10-08',
      note: 'Passed, no advisories',
      doneBy: staffId,
    });
  });

  it('takes today as the day done, and lets the next date be set (an MOT renewed early keeps its date)', async () => {
    const { deps } = setup();
    await withMot(deps);
    const today = await markDone(deps, booker, staffId, van, motId, {});
    expect(today.ok && [today.value.lastDone, today.value.dueDate]).toEqual([
      '2026-10-09',
      '2027-10-09',
    ]);
    const early = await markDone(deps, booker, staffId, lorry, motId, {
      doneOn: '2026-10-05',
      nextDue: '2027-10-20',
    });
    expect(early.ok && early.value.dueDate).toBe('2027-10-20');
  });

  it('refuses work dated in the future, a next date not after it, a long note, and bad days', async () => {
    const { deps } = setup();
    await withMot(deps);
    const reason = async (input: Parameters<typeof markDone>[5]) => {
      const r = await markDone(deps, booker, staffId, van, motId, input);
      return r.ok ? 'ok' : r.error.tag === 'InvalidWork' ? r.error.reason : r.error.tag;
    };
    expect(await reason({ doneOn: '2026-10-10' })).toBe('done_in_future');
    expect(await reason({ doneOn: '2026-10-05', nextDue: '2026-10-05' })).toBe(
      'next_not_after_done',
    );
    expect(await reason({ note: 'x'.repeat(501) })).toBe('note_too_long');
    expect(await reason({ doneOn: 'yesterday' })).toBe('InvalidDay');
  });

  it('refuses anyone without manage_maintenance, and a vehicle or item that is not theirs', async () => {
    const { deps } = setup();
    await withMot(deps);
    expect(await markDone(deps, dispatcher, staffId, van, motId, {})).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await markDone(deps, outsider, staffId, van, motId, {})).toEqual({
      ok: false,
      error: { tag: 'VehicleNotFound' },
    });
    expect(await setDueDate(deps, booker, staffId, theirs, motId, '2027-01-01')).toEqual({
      ok: false,
      error: { tag: 'VehicleNotFound' },
    });
    expect(
      await setDueDate(
        deps,
        booker,
        staffId,
        van,
        makeId<'MaintenanceItemId'>('nope'),
        '2027-01-01',
      ),
    ).toEqual({ ok: false, error: { tag: 'ItemNotFound' } });
  });

  it('refuses an item for a vehicle it does not apply to', async () => {
    const { deps } = setup();
    await createItemType(deps, booker, {
      ...input,
      name: 'Tail-lift',
      appliesTo: 'selected',
      vehicleIds: [lorry],
      id: motId,
      companyId: acme,
    });
    expect(await setDueDate(deps, booker, staffId, van, motId, '2027-01-01')).toEqual({
      ok: false,
      error: { tag: 'ItemNotForVehicle' },
    });
  });

  it('keeps what was last done when a due date is corrected', async () => {
    const { deps } = setup();
    await withMot(deps);
    await markDone(deps, booker, staffId, van, motId, { doneOn: '2026-10-08' });
    const corrected = await setDueDate(deps, booker, staffId, van, motId, '2027-10-01');
    expect(corrected.ok && [corrected.value.dueDate, corrected.value.lastDone]).toEqual([
      '2027-10-01',
      '2026-10-08',
    ]);
  });

  it('shows one vehicle’s items with the history, newest first, to those who may see it', async () => {
    const { deps } = setup();
    await withMot(deps);
    await markDone(deps, booker, staffId, van, motId, { doneOn: '2025-10-01' });
    await markDone(deps, booker, staffId, van, motId, { doneOn: '2026-10-08' });
    const result = await vehicleMaintenance(deps, dispatcher, van);
    expect(result.ok && result.value.rows.map((r) => r.itemName)).toEqual(['MOT']);
    expect(result.ok && result.value.history.map((h) => h.doneOn)).toEqual([
      '2026-10-08',
      '2025-10-01',
    ]);
    expect(await vehicleMaintenance(deps, nobody, van)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await vehicleMaintenance(deps, outsider, van)).toEqual({
      ok: false,
      error: { tag: 'VehicleNotFound' },
    });
  });
});
