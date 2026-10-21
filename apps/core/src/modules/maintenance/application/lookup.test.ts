import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { err, ok } from '../../../shared/result.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { ItemTypeInput } from '../domain/maintenance.js';
import { createItemType } from './item-types.js';
import { lookupVehicleDates } from './lookup.js';
import type { StaffCaller } from './ports/directories.js';
import type { VehicleLookup } from './ports/vehicle-lookup.js';
import { setDueDate } from './schedule.js';
import { InMemoryItemTypeRepository } from './testing/in-memory-item-type-repository.js';
import { InMemoryScheduleRepository } from './testing/in-memory-schedule-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const van = makeId<'FleetVehicleId'>('van');
const noPlate = makeId<'FleetVehicleId'>('no-plate');
const motId = makeId<'MaintenanceItemId'>('mot');
const taxId = makeId<'MaintenanceItemId'>('tax');

const booker: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_maintenance'] };
const reader: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['view_reports'] };
const outsider: StaffCaller = {
  kind: 'fleet',
  companyId: beta,
  privileges: ['manage_maintenance'],
};

const input: ItemTypeInput = {
  name: 'MOT',
  intervalValue: 12,
  intervalUnit: 'months',
  warnDays: 28,
  appliesTo: 'all',
  vehicleIds: [],
};

function setup(lookup?: Partial<VehicleLookup>) {
  const items = new InMemoryItemTypeRepository();
  const schedules = new InMemoryScheduleRepository();
  const asked: string[] = [];
  const vehicleLookup: VehicleLookup = {
    configured: true,
    lookup: (registration) => {
      asked.push(registration);
      return Promise.resolve(
        ok({ motExpiry: '2027-03-01', taxDue: '2026-12-01', motStatus: 'Valid' }),
      );
    },
    ...lookup,
  };
  const deps = {
    items,
    schedules,
    clock: new FakeClock('2026-10-09T09:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    vehicles: {
      listForCompany: () => Promise.resolve([]),
      find: (v: typeof van) =>
        Promise.resolve(
          v === van
            ? { id: van, name: 'Van', registration: 'AB12 CDE', companyId: acme }
            : v === noPlate
              ? { id: noPlate, name: 'New', registration: undefined, companyId: acme }
              : null,
        ),
    },
    lookup: vehicleLookup,
  };
  return { deps, asked };
}

async function withItems(deps: ReturnType<typeof setup>['deps']) {
  await createItemType(deps, booker, { ...input, id: motId, companyId: acme });
  await createItemType(deps, booker, { ...input, name: 'Road tax', id: taxId, companyId: acme });
}

describe('lookupVehicleDates', () => {
  it('returns the dates and what to fill in, and saves nothing', async () => {
    const { deps, asked } = setup();
    await withItems(deps);
    const result = await lookupVehicleDates(deps, booker, van);
    expect(result).toMatchObject({
      ok: true,
      value: {
        registration: 'AB12 CDE',
        motExpiry: '2027-03-01',
        taxDue: '2026-12-01',
        suggestions: [
          { itemId: motId, kind: 'mot', dueDate: '2027-03-01' },
          { itemId: taxId, kind: 'tax', dueDate: '2026-12-01' },
        ],
      },
    });
    expect(asked).toEqual(['AB12 CDE']);
    expect(await deps.schedules.find(van, motId)).toBeNull();
  });

  it('leaves out an item already due on that day', async () => {
    const { deps } = setup();
    await withItems(deps);
    await setDueDate(deps, booker, staffId, van, motId, '2027-03-01');
    const result = await lookupVehicleDates(deps, booker, van);
    expect(result.ok && result.value.suggestions.map((s) => s.itemId)).toEqual([taxId]);
  });

  it('is for people who manage maintenance', async () => {
    const { deps, asked } = setup();
    expect(await lookupVehicleDates(deps, reader, van)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await lookupVehicleDates(deps, { kind: 'platform' }, van)).toMatchObject({ ok: true });
    expect(asked).toHaveLength(1);
  });

  it("does not reveal another company's vehicle or an unknown one", async () => {
    const { deps } = setup();
    expect(await lookupVehicleDates(deps, outsider, van)).toEqual({
      ok: false,
      error: { tag: 'VehicleNotFound' },
    });
    expect(await lookupVehicleDates(deps, booker, makeId<'FleetVehicleId'>('nope'))).toEqual({
      ok: false,
      error: { tag: 'VehicleNotFound' },
    });
  });

  it('says so when no key is set, or the vehicle has no registration', async () => {
    const off = setup({ configured: false });
    expect(await lookupVehicleDates(off.deps, booker, van)).toEqual({
      ok: false,
      error: { tag: 'LookupNotConfigured' },
    });
    expect(off.asked).toEqual([]);
    const { deps } = setup();
    expect(await lookupVehicleDates(deps, booker, noPlate)).toEqual({
      ok: false,
      error: { tag: 'NoRegistration' },
    });
  });

  it('passes on a registration that is not on the record, or a service that is down', async () => {
    const missing = setup({
      lookup: () => Promise.resolve(err({ tag: 'LookupNotFound' as const })),
    });
    expect(await lookupVehicleDates(missing.deps, booker, van)).toEqual({
      ok: false,
      error: { tag: 'LookupNotFound' },
    });
    const down = setup({
      lookup: () => Promise.resolve(err({ tag: 'LookupUnavailable' as const })),
    });
    expect(await lookupVehicleDates(down.deps, booker, van)).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
  });
});
