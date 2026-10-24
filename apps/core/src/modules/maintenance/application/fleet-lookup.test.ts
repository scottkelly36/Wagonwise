import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { err, ok } from '../../../shared/result.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { ItemTypeInput, VehicleSummary } from '../domain/maintenance.js';
import { MAX_FLEET_LOOKUPS, lookupFleetDates } from './fleet-lookup.js';
import { createItemType } from './item-types.js';
import type { StaffCaller } from './ports/directories.js';
import type { VehicleLookup } from './ports/vehicle-lookup.js';
import { setDueDate } from './schedule.js';
import { InMemoryItemTypeRepository } from './testing/in-memory-item-type-repository.js';
import { InMemoryScheduleRepository } from './testing/in-memory-schedule-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const motId = makeId<'MaintenanceItemId'>('mot');

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

const vehicle = (id: string, registration: string | undefined): VehicleSummary => ({
  id: makeId<'FleetVehicleId'>(id),
  name: `Vehicle ${id}`,
  registration,
});

function setup(vehicles: VehicleSummary[], lookup?: Partial<VehicleLookup>) {
  const items = new InMemoryItemTypeRepository();
  const schedules = new InMemoryScheduleRepository();
  const asked: string[] = [];
  let inFlight = 0;
  let mostAtOnce = 0;
  const vehicleLookup: VehicleLookup = {
    configured: true,
    lookup: async (registration) => {
      asked.push(registration);
      inFlight += 1;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      if (registration === 'NOSUCH') return err({ tag: 'LookupNotFound' as const });
      if (registration === 'DOWN') return err({ tag: 'LookupUnavailable' as const });
      return ok({ motExpiry: '2027-07-11', motStatus: 'Valid' });
    },
    ...lookup,
  };
  const deps = {
    items,
    schedules,
    clock: new FakeClock('2026-10-09T09:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    vehicles: {
      listForCompany: (c: typeof acme) => Promise.resolve(c === acme ? vehicles : []),
      find: (v: ReturnType<typeof makeId<'FleetVehicleId'>>) =>
        Promise.resolve(
          vehicles.filter((x) => x.id === v).map((x) => ({ ...x, companyId: acme }))[0] ?? null,
        ),
    },
    lookup: vehicleLookup,
  };
  return { deps, asked, mostAtOnce: () => mostAtOnce };
}

describe('lookupFleetDates', () => {
  it('looks up every vehicle with a registration and says what would change for each, saving nothing', async () => {
    const { deps, asked } = setup([
      vehicle('a', 'AB12CDE'),
      vehicle('b', 'XY99ZZZ'),
      vehicle('c', undefined),
    ]);
    await createItemType(deps, booker, { ...input, id: motId, companyId: acme });

    const result = await lookupFleetDates(deps, booker, acme);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows.map((r) => [r.registration, r.outcome, r.motExpiry])).toEqual([
      ['AB12CDE', 'checked', '2027-07-11'],
      ['XY99ZZZ', 'checked', '2027-07-11'],
    ]);
    expect(result.value.rows[0]!.suggestions).toMatchObject([
      { itemId: motId, kind: 'mot', dueDate: '2027-07-11' },
    ]);
    expect(result.value.withoutRegistration).toBe(1);
    expect(result.value.notChecked).toBe(0);
    expect(asked.sort()).toEqual(['AB12CDE', 'XY99ZZZ']);
    expect(await deps.schedules.listForCompany(acme)).toEqual([]);
  });

  it('leaves out a date a vehicle already has', async () => {
    const { deps } = setup([vehicle('a', 'AB12CDE')]);
    await createItemType(deps, booker, { ...input, id: motId, companyId: acme });
    await setDueDate(deps, booker, staffId, makeId<'FleetVehicleId'>('a'), motId, '2027-07-11');

    const result = await lookupFleetDates(deps, booker, acme);
    expect(result.ok && result.value.rows[0]!.suggestions).toEqual([]);
  });

  it('reports a vehicle the record does not know, or cannot reach, without stopping the rest', async () => {
    const { deps } = setup([vehicle('a', 'NOSUCH'), vehicle('b', 'DOWN'), vehicle('c', 'AB12CDE')]);
    const result = await lookupFleetDates(deps, booker, acme);
    expect(result.ok && result.value.rows.map((r) => r.outcome)).toEqual([
      'not_found',
      'unavailable',
      'checked',
    ]);
  });

  it('asks only a few at a time, and stops at the limit, counting what is left', async () => {
    const many = Array.from({ length: MAX_FLEET_LOOKUPS + 5 }, (_, i) =>
      vehicle(`v${i}`, `AB${String(i).padStart(2, '0')}CDE`),
    );
    const { deps, asked, mostAtOnce } = setup(many);
    const result = await lookupFleetDates(deps, booker, acme);
    expect(result.ok && result.value.rows).toHaveLength(MAX_FLEET_LOOKUPS);
    expect(result.ok && result.value.notChecked).toBe(5);
    expect(asked).toHaveLength(MAX_FLEET_LOOKUPS);
    expect(mostAtOnce()).toBeLessThanOrEqual(3);
  });

  it('is for people who manage maintenance, and looks nothing up for anyone else', async () => {
    const { deps, asked } = setup([vehicle('a', 'AB12CDE')]);
    expect(await lookupFleetDates(deps, reader, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await lookupFleetDates(deps, outsider, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await lookupFleetDates(deps, { kind: 'platform' }, acme)).toMatchObject({ ok: true });
    expect(asked).toHaveLength(1);
  });

  it('says so when no source is switched on, asking nothing', async () => {
    const { deps, asked } = setup([vehicle('a', 'AB12CDE')], { configured: false });
    expect(await lookupFleetDates(deps, booker, acme)).toEqual({
      ok: false,
      error: { tag: 'LookupNotConfigured' },
    });
    expect(asked).toEqual([]);
  });
});
