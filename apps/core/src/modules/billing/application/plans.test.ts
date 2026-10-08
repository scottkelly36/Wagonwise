import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import {
  capacityHistory,
  listPlans,
  scheduleCapacity,
  setPricePerVehicle,
  vehicleCapacityToday,
} from './plans.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryPlanRepository } from './testing/in-memory-plan-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const admin: StaffCaller = { kind: 'platform' };
const manager: StaffCaller = {
  kind: 'fleet',
  companyId: acme,
  privileges: ['manage_users', 'manage_fleet'],
};

function setup(now = '2026-10-09T09:00:00.000Z') {
  const plans = new InMemoryPlanRepository();
  const clock = new FakeClock(now);
  const companies = {
    list: () =>
      Promise.resolve([
        { id: beta, name: 'Beta Haulage' },
        { id: acme, name: 'Acme Freight' },
      ]),
  };
  return { plans, clock, deps: { plans, companies, clock } };
}

describe('scheduleCapacity', () => {
  it('starts a company at 0 vehicles until an admin sets a capacity', async () => {
    const { deps } = setup();
    expect(await vehicleCapacityToday(deps, acme)).toBe(0);
    await scheduleCapacity(deps, admin, staffId, acme, {
      capacity: 5,
      effectiveFrom: '2026-10-09',
    });
    expect(await vehicleCapacityToday(deps, acme)).toBe(5);
    expect(await vehicleCapacityToday(deps, beta)).toBe(0);
  });

  it('holds a future change back until its day, and keeps today’s capacity meanwhile', async () => {
    const { deps, clock } = setup();
    await scheduleCapacity(deps, admin, staffId, acme, {
      capacity: 5,
      effectiveFrom: '2026-10-09',
    });
    await scheduleCapacity(deps, admin, staffId, acme, {
      capacity: 8,
      effectiveFrom: '2026-11-01',
    });
    expect(await vehicleCapacityToday(deps, acme)).toBe(5);
    clock.set('2026-11-01T09:00:00.000Z');
    expect(await vehicleCapacityToday(deps, acme)).toBe(8);
  });

  it('setting the same day again replaces it', async () => {
    const { deps } = setup();
    const day = { effectiveFrom: '2026-11-01' };
    await scheduleCapacity(deps, admin, staffId, acme, { capacity: 8, ...day });
    await scheduleCapacity(deps, admin, staffId, acme, { capacity: 6, ...day });
    const history = await capacityHistory(deps, admin, acme);
    expect(history.ok && history.value.map((c) => c.capacity)).toEqual([6]);
  });

  it('refuses a past day, because it would change what an earlier month was billed', async () => {
    const { deps } = setup();
    expect(
      await scheduleCapacity(deps, admin, staffId, acme, {
        capacity: 5,
        effectiveFrom: '2026-10-08',
      }),
    ).toEqual({ ok: false, error: { tag: 'DayInPast' } });
  });

  it('counts today as it is in the UK, not in UTC', async () => {
    // 23:30 UTC on 30 June is already 1 July in the UK, so 1 July is today and 30 June is the past.
    const { deps } = setup('2026-06-30T23:30:00.000Z');
    expect(
      (
        await scheduleCapacity(deps, admin, staffId, acme, {
          capacity: 5,
          effectiveFrom: '2026-07-01',
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await scheduleCapacity(deps, admin, staffId, acme, {
          capacity: 5,
          effectiveFrom: '2026-06-30',
        })
      ).ok,
    ).toBe(false);
  });

  it('refuses a bad capacity or day, an unknown company, and anyone but a WagonWise admin', async () => {
    const { deps, plans } = setup();
    const ok = { capacity: 5, effectiveFrom: '2026-11-01' };
    expect(await scheduleCapacity(deps, admin, staffId, acme, { ...ok, capacity: -1 })).toEqual({
      ok: false,
      error: { tag: 'InvalidCapacity' },
    });
    expect(
      await scheduleCapacity(deps, admin, staffId, acme, { ...ok, effectiveFrom: 'soon' }),
    ).toEqual({
      ok: false,
      error: { tag: 'InvalidDay' },
    });
    expect(await scheduleCapacity(deps, admin, staffId, makeId<'CompanyId'>('nobody'), ok)).toEqual(
      { ok: false, error: { tag: 'CompanyNotFound' } },
    );
    expect(await scheduleCapacity(deps, manager, staffId, acme, ok)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await plans.listAllChanges()).toEqual([]);
  });
});

describe('setPricePerVehicle and listPlans', () => {
  it('lists every company A to Z with price, today’s capacity, the next change and the monthly total', async () => {
    const { deps } = setup();
    await scheduleCapacity(deps, admin, staffId, acme, {
      capacity: 5,
      effectiveFrom: '2026-10-09',
    });
    await scheduleCapacity(deps, admin, staffId, acme, {
      capacity: 8,
      effectiveFrom: '2026-11-01',
    });
    await setPricePerVehicle(deps, admin, staffId, acme, 1500);
    const result = await listPlans(deps, admin);
    expect(result.ok && result.value).toEqual([
      {
        companyId: acme,
        name: 'Acme Freight',
        pricePerVehiclePence: 1500,
        capacityToday: 5,
        next: { effectiveFrom: '2026-11-01', capacity: 8 },
        monthlyPence: 7500,
      },
      {
        companyId: beta,
        name: 'Beta Haulage',
        pricePerVehiclePence: 1000,
        capacityToday: 0,
        next: undefined,
        monthlyPence: 0,
      },
    ]);
  });

  it('refuses a price that is not whole pence, and a company manager', async () => {
    const { deps, plans } = setup();
    expect(await setPricePerVehicle(deps, admin, staffId, acme, 9.99)).toEqual({
      ok: false,
      error: { tag: 'InvalidPrice' },
    });
    expect(await setPricePerVehicle(deps, manager, staffId, acme, 1000)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await listPlans(deps, manager)).ok).toBe(false);
    expect(plans.prices.size).toBe(0);
  });
});
