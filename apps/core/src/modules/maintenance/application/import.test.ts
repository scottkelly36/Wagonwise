import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { ItemTypeInput, VehicleSummary } from '../domain/maintenance.js';
import { importDueDates, MAX_IMPORT_ROWS, normaliseRegistration } from './import.js';
import { createItemType } from './item-types.js';
import type { StaffCaller } from './ports/directories.js';
import type { ScheduleDeps } from './schedule.js';
import { InMemoryItemTypeRepository } from './testing/in-memory-item-type-repository.js';
import { InMemoryScheduleRepository } from './testing/in-memory-schedule-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const van = makeId<'FleetVehicleId'>('van');
const lorry = makeId<'FleetVehicleId'>('lorry');
const twin1 = makeId<'FleetVehicleId'>('twin1');
const twin2 = makeId<'FleetVehicleId'>('twin2');

const booker: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_maintenance'] };
const dispatcher: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const outsider: StaffCaller = {
  kind: 'fleet',
  companyId: beta,
  privileges: ['manage_maintenance'],
};

const body: ItemTypeInput = {
  name: 'MOT',
  intervalValue: 12,
  intervalUnit: 'months',
  warnDays: 28,
  appliesTo: 'all',
  vehicleIds: [],
};

async function setup() {
  const items = new InMemoryItemTypeRepository();
  const schedules = new InMemoryScheduleRepository();
  const list: VehicleSummary[] = [
    { id: van, name: 'Van', registration: 'AB12 CDE' },
    { id: lorry, name: 'Lorry', registration: 'XY99ZZZ' },
    { id: twin1, name: 'Twin 1', registration: 'DU11PLX' },
    { id: twin2, name: 'Twin 2', registration: 'DU11 PLX' },
  ];
  const deps: ScheduleDeps = {
    items,
    schedules,
    vehicles: {
      listForCompany: (c) => Promise.resolve(c === acme ? list : []),
      find: (v) => {
        const found = list.find((x) => x.id === v);
        return Promise.resolve(found === undefined ? null : { ...found, companyId: acme });
      },
    },
    clock: new FakeClock('2026-10-09T09:00:00.000Z'),
    ids: new SequentialIdGenerator(),
  };
  await createItemType(deps, booker, {
    ...body,
    id: makeId<'MaintenanceItemId'>('mot'),
    companyId: acme,
  });
  await createItemType(deps, booker, {
    ...body,
    name: 'Tail lift',
    appliesTo: 'selected',
    vehicleIds: [lorry],
    id: makeId<'MaintenanceItemId'>('lift'),
    companyId: acme,
  });
  return { deps, schedules };
}

describe('importDueDates', () => {
  it('matches registrations without regard to spaces or case, and items without regard to case', async () => {
    const { deps, schedules } = await setup();
    const result = await importDueDates(deps, booker, staffId, acme, [
      { registration: 'ab12cde', itemName: ' mot ', dueDate: '2027-01-31' },
      { registration: 'XY99 ZZZ', itemName: 'MOT', dueDate: '2027-02-28' },
    ]);
    expect(result.ok && result.value).toEqual([{ status: 'applied' }, { status: 'applied' }]);
    const set = await schedules.find(van, makeId<'MaintenanceItemId'>('mot'));
    expect(set?.dueDate).toBe('2027-01-31');
  });

  it('reports each row that cannot go in, and still applies the rest', async () => {
    const { deps } = await setup();
    const result = await importDueDates(deps, booker, staffId, acme, [
      { registration: 'NOPE', itemName: 'MOT', dueDate: '2027-01-31' },
      { registration: '', itemName: 'MOT', dueDate: '2027-01-31' },
      { registration: 'DU11PLX', itemName: 'MOT', dueDate: '2027-01-31' },
      { registration: 'AB12CDE', itemName: 'Fire extinguisher', dueDate: '2027-01-31' },
      { registration: 'AB12CDE', itemName: 'Tail lift', dueDate: '2027-01-31' },
      { registration: 'AB12CDE', itemName: 'MOT', dueDate: '31/01/2027' },
      { registration: 'XY99ZZZ', itemName: 'Tail lift', dueDate: '2027-03-01' },
    ]);
    expect(result.ok && result.value).toEqual([
      { status: 'skipped', reason: 'unknown_vehicle' },
      { status: 'skipped', reason: 'unknown_vehicle' },
      { status: 'skipped', reason: 'ambiguous_vehicle' },
      { status: 'skipped', reason: 'unknown_item' },
      { status: 'skipped', reason: 'not_for_vehicle' },
      { status: 'skipped', reason: 'invalid_date' },
      { status: 'applied' },
    ]);
  });

  it('is for whoever keeps maintenance, and takes a bounded number of rows', async () => {
    const { deps } = await setup();
    const row = { registration: 'AB12CDE', itemName: 'MOT', dueDate: '2027-01-31' };
    expect(await importDueDates(deps, dispatcher, staffId, acme, [row])).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await importDueDates(deps, outsider, staffId, acme, [row])).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row);
    expect(await importDueDates(deps, booker, staffId, acme, many)).toEqual({
      ok: false,
      error: { tag: 'TooManyRows' },
    });
  });

  it('normalises registrations', () => {
    expect(normaliseRegistration(' ab12  cde ')).toBe('AB12CDE');
  });
});
