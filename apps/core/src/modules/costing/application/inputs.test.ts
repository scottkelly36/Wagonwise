import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import {
  isActiveIn,
  isDay,
  isMonth,
  planChange,
  planStop,
  rateOn,
  validateRate,
  validateRunningCost,
} from '../domain/inputs.js';
import {
  addRunningCost,
  changeRunningCost,
  deleteDriverRate,
  deleteRunningCost,
  listDriverRates,
  listRunningCosts,
  setDriverRate,
  stopRunningCost,
  type InputsDeps,
} from './inputs.js';
import type { StaffCaller } from './ports.js';
import {
  FakeDriverDirectory,
  InMemoryDriverRates,
  InMemoryRunningCosts,
} from './testing/in-memory-inputs.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const van = makeId<'FleetVehicleId'>('van');
const theirs = makeId<'FleetVehicleId'>('theirs');
const sam = makeId<'DriverId'>('d0000000-0000-4000-8000-000000000001');
const kim = makeId<'DriverId'>('d0000000-0000-4000-8000-000000000002');

const money: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_billing'] };
const manager: StaffCaller = {
  kind: 'fleet',
  companyId: acme,
  privileges: ['manage_fleet', 'view_reports'],
};
const outsider: StaffCaller = { kind: 'fleet', companyId: beta, privileges: ['manage_billing'] };
const admin: StaffCaller = { kind: 'platform' };

function setup() {
  const runningCosts = new InMemoryRunningCosts();
  const rates = new InMemoryDriverRates();
  const deps: InputsDeps = {
    runningCosts,
    rates,
    drivers: new FakeDriverDirectory(
      new Map([
        [
          acme,
          [
            { id: sam, name: 'sam@x.test' },
            { id: kim, name: 'Kim' },
          ],
        ],
        [beta, []],
      ]),
    ),
    vehicles: {
      listForCompany: () => Promise.resolve([]),
      find: (v) =>
        Promise.resolve(
          v === van
            ? { id: van, name: 'Van', registration: undefined, companyId: acme }
            : v === theirs
              ? { id: theirs, name: 'Theirs', registration: undefined, companyId: beta }
              : null,
        ),
    },
    ids: new SequentialIdGenerator(),
    clock: new FakeClock('2026-10-09T09:00:00.000Z'),
  };
  return { deps, runningCosts, rates };
}

describe('months, days and the rules for changing a standing cost', () => {
  it('knows a real month and a real day', () => {
    expect(isMonth('2026-10')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isDay('2026-02-28')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
  });

  it('is active from its first month until its last', () => {
    const c = { fromMonth: '2026-03', toMonth: '2026-05' };
    expect(['2026-02', '2026-03', '2026-05', '2026-06'].map((m) => isActiveIn(c, m))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(isActiveIn({ fromMonth: '2026-03', toMonth: undefined }, '2030-01')).toBe(true);
  });

  it('updates from the first month, splits from a later one, and refuses outside its life', () => {
    expect(planChange({ fromMonth: '2026-03', toMonth: undefined }, '2026-03')).toEqual({
      ok: true,
      value: { kind: 'update' },
    });
    expect(planChange({ fromMonth: '2026-03', toMonth: undefined }, '2026-06')).toEqual({
      ok: true,
      value: { kind: 'split', closeTo: '2026-05', newFrom: '2026-06' },
    });
    expect(planChange({ fromMonth: '2026-03', toMonth: undefined }, '2026-01').ok).toBe(false);
    expect(planChange({ fromMonth: '2026-03', toMonth: '2026-05' }, '2026-07').ok).toBe(false);
    expect(planChange({ fromMonth: '2026-01', toMonth: undefined }, '2026-01-x').ok).toBe(true);
  });

  it('ends a cost the month before, removes one stopped from its start, and refuses an ended one', () => {
    expect(planStop({ fromMonth: '2026-03', toMonth: undefined }, '2026-06')).toEqual({
      ok: true,
      value: { kind: 'end', toMonth: '2026-05' },
    });
    expect(planStop({ fromMonth: '2026-03', toMonth: undefined }, '2026-03')).toEqual({
      ok: true,
      value: { kind: 'remove' },
    });
    expect(planStop({ fromMonth: '2026-03', toMonth: '2026-04' }, '2026-08').ok).toBe(false);
    expect(planChange({ fromMonth: '2025-12', toMonth: undefined }, '2026-01')).toEqual({
      ok: true,
      value: { kind: 'split', closeTo: '2025-12', newFrom: '2026-01' },
    });
  });
});

describe('validation', () => {
  it('trims, and refuses a blank description, a negative or silly amount, and a bad month', () => {
    expect(
      validateRunningCost({
        description: '  Insurance ',
        monthlyPence: 18_000,
        fromMonth: '2026-10',
      }),
    ).toEqual({
      ok: true,
      value: { description: 'Insurance', monthlyPence: 18_000, fromMonth: '2026-10' },
    });
    for (const bad of [
      { description: ' ', monthlyPence: 1, fromMonth: '2026-10' },
      { description: 'x'.repeat(81), monthlyPence: 1, fromMonth: '2026-10' },
      { description: 'x', monthlyPence: -1, fromMonth: '2026-10' },
      { description: 'x', monthlyPence: 1.5, fromMonth: '2026-10' },
      { description: 'x', monthlyPence: 100_000_001, fromMonth: '2026-10' },
      { description: 'x', monthlyPence: 1, fromMonth: '2026-1' },
    ]) {
      expect(validateRunningCost(bad).ok).toBe(false);
    }
    expect(validateRate({ hourlyPence: 1_450, fromDay: '2026-10-01' }).ok).toBe(true);
    for (const bad of [
      { hourlyPence: 0, fromDay: '2026-10-01' },
      { hourlyPence: 50_001, fromDay: '2026-10-01' },
      { hourlyPence: 1_000.5, fromDay: '2026-10-01' },
      { hourlyPence: 1_000, fromDay: '2026-02-31' },
    ]) {
      expect(validateRate(bad).ok).toBe(false);
    }
  });

  it('finds the rate on a day: the latest that has started', () => {
    const rates = [
      { driverId: sam, fromDay: '2026-01-01', hourlyPence: 1_200 },
      { driverId: sam, fromDay: '2026-07-01', hourlyPence: 1_350 },
      { driverId: kim, fromDay: '2026-01-01', hourlyPence: 1_500 },
    ];
    expect(rateOn(rates, sam, '2026-06-30')).toBe(1_200);
    expect(rateOn(rates, sam, '2026-07-01')).toBe(1_350);
    expect(rateOn(rates, sam, '2025-12-31')).toBeUndefined();
    expect(rateOn(rates, kim, '2026-10-01')).toBe(1_500);
  });
});

describe('running costs', () => {
  it('adds one for a vehicle or for the firm, and lists them', async () => {
    const { deps } = setup();
    const a = await addRunningCost(deps, money, staffId, acme, {
      vehicleId: van,
      description: 'Insurance',
      monthlyPence: 18_000,
      fromMonth: '2026-10',
    });
    const b = await addRunningCost(deps, money, staffId, acme, {
      description: 'Office rent',
      monthlyPence: 40_000,
      fromMonth: '2026-10',
    });
    expect(a.ok && a.value).toMatchObject({ vehicleId: van, toMonth: undefined });
    expect(b.ok && b.value.vehicleId).toBeUndefined();
    const listed = await listRunningCosts(deps, money, acme);
    expect(listed.ok && listed.value).toHaveLength(2);
  });

  it('refuses another company’s vehicle, a bad figure, and anyone without manage_billing', async () => {
    const { deps } = setup();
    const base = { description: 'Insurance', monthlyPence: 18_000, fromMonth: '2026-10' };
    expect(
      await addRunningCost(deps, money, staffId, acme, { ...base, vehicleId: theirs }),
    ).toEqual({
      ok: false,
      error: { tag: 'VehicleNotFound' },
    });
    expect(
      (await addRunningCost(deps, money, staffId, acme, { ...base, monthlyPence: -5 })).ok,
    ).toBe(false);
    for (const caller of [manager, outsider]) {
      expect(await addRunningCost(deps, caller, staffId, acme, base)).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
      expect(await listRunningCosts(deps, caller, acme)).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
    expect((await addRunningCost(deps, admin, staffId, acme, base)).ok).toBe(true);
  });

  it('changes from a later month without touching the earlier ones, and from its first month in place', async () => {
    const { deps, runningCosts } = setup();
    const added = await addRunningCost(deps, money, staffId, acme, {
      vehicleId: van,
      description: 'Insurance',
      monthlyPence: 18_000,
      fromMonth: '2026-04',
    });
    if (!added.ok) throw new Error('setup');
    const later = await changeRunningCost(deps, money, staffId, added.value.id, {
      description: 'Insurance',
      monthlyPence: 21_000,
      fromMonth: '2026-10',
    });
    expect(later.ok && later.value).toMatchObject({
      monthlyPence: 21_000,
      fromMonth: '2026-10',
      toMonth: undefined,
    });
    expect(runningCosts.rows.get(added.value.id)).toMatchObject({
      monthlyPence: 18_000,
      toMonth: '2026-09',
    });
    const inPlace = await changeRunningCost(deps, money, staffId, added.value.id, {
      description: 'Insurance (annual)',
      monthlyPence: 17_500,
      fromMonth: '2026-04',
    });
    expect(inPlace.ok && inPlace.value.description).toBe('Insurance (annual)');
    expect(runningCosts.rows.get(added.value.id)).toMatchObject({
      monthlyPence: 17_500,
      toMonth: '2026-09',
    });
  });

  it('stops a cost, removes one stopped from its first month, and deletes a mistake', async () => {
    const { deps, runningCosts } = setup();
    const a = await addRunningCost(deps, money, staffId, acme, {
      description: 'Yard',
      monthlyPence: 5_000,
      fromMonth: '2026-04',
    });
    const b = await addRunningCost(deps, money, staffId, acme, {
      description: 'Slip',
      monthlyPence: 5_000,
      fromMonth: '2026-10',
    });
    const c = await addRunningCost(deps, money, staffId, acme, {
      description: 'Typo',
      monthlyPence: 5_000,
      fromMonth: '2026-10',
    });
    if (!a.ok || !b.ok || !c.ok) throw new Error('setup');
    expect((await stopRunningCost(deps, money, a.value.id, '2026-12')).ok).toBe(true);
    expect(runningCosts.rows.get(a.value.id)?.toMonth).toBe('2026-11');
    expect((await stopRunningCost(deps, money, b.value.id, '2026-10')).ok).toBe(true);
    expect(runningCosts.rows.has(b.value.id)).toBe(false);
    expect((await stopRunningCost(deps, money, a.value.id, '2027-03')).ok).toBe(false);
    expect((await deleteRunningCost(deps, money, c.value.id)).ok).toBe(true);
    expect(runningCosts.rows.has(c.value.id)).toBe(false);
  });

  it('hides another company’s cost, and refuses a manager who is not the money person', async () => {
    const { deps } = setup();
    const a = await addRunningCost(deps, money, staffId, acme, {
      description: 'Yard',
      monthlyPence: 5_000,
      fromMonth: '2026-04',
    });
    if (!a.ok) throw new Error('setup');
    expect(await deleteRunningCost(deps, outsider, a.value.id)).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    expect(await deleteRunningCost(deps, manager, a.value.id)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('driver rates', () => {
  it('sets a rate from a day, lists every driver with their rates newest first, and replaces one on the same day', async () => {
    const { deps } = setup();
    await setDriverRate(deps, money, staffId, acme, {
      driverId: sam,
      hourlyPence: 1_200,
      fromDay: '2026-01-01',
    });
    await setDriverRate(deps, money, staffId, acme, {
      driverId: sam,
      hourlyPence: 1_350,
      fromDay: '2026-07-01',
    });
    await setDriverRate(deps, money, staffId, acme, {
      driverId: sam,
      hourlyPence: 1_400,
      fromDay: '2026-07-01',
    });
    const listed = await listDriverRates(deps, money, acme);
    if (!listed.ok) throw new Error('list');
    expect(listed.value.map((d) => [d.name, d.rates.map((r) => r.hourlyPence)])).toEqual([
      ['sam@x.test', [1_400, 1_200]],
      ['Kim', []],
    ]);
  });

  it('refuses a driver of another company, a bad rate, and anyone but the money person', async () => {
    const { deps } = setup();
    const input = { driverId: sam, hourlyPence: 1_200, fromDay: '2026-01-01' };
    expect(await setDriverRate(deps, money, staffId, beta, input)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await setDriverRate(deps, admin, staffId, beta, input)).toEqual({
      ok: false,
      error: { tag: 'DriverNotFound' },
    });
    expect((await setDriverRate(deps, money, staffId, acme, { ...input, hourlyPence: 0 })).ok).toBe(
      false,
    );
    expect(await setDriverRate(deps, manager, staffId, acme, input)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await listDriverRates(deps, manager, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('deletes a rate entered by mistake, but not another company’s', async () => {
    const { deps, rates } = setup();
    const r = await setDriverRate(deps, money, staffId, acme, {
      driverId: sam,
      hourlyPence: 1_200,
      fromDay: '2026-01-01',
    });
    if (!r.ok) throw new Error('setup');
    expect(await deleteDriverRate(deps, outsider, r.value.id)).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    expect((await deleteDriverRate(deps, money, r.value.id)).ok).toBe(true);
    expect(rates.rows.size).toBe(0);
  });
});
