import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { FuelTransaction } from './fuel.js';
import type { DriverRate, RunningCost } from './inputs.js';
import { allocate, buildCostReport, ukDay, ukMonthRange, type DeliveredJob } from './job-costs.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const v1 = makeId<'FleetVehicleId'>('v1');
const v2 = makeId<'FleetVehicleId'>('v2');
const d1 = makeId<'DriverId'>('d1');
const d2 = makeId<'DriverId'>('d2');

const at = (iso: string) => new Date(iso);

describe('allocate', () => {
  it('shares in proportion and adds up to the total to the penny', () => {
    expect(allocate(16_000, [2, 6])).toEqual([4_000, 12_000]);
    const shares = allocate(1_000, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1_000);
    expect([...shares].sort()).toEqual([333, 333, 334]);
    expect(allocate(5, [1, 1]).reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('shares nothing when there is no weight, or no one to share with', () => {
    expect(allocate(1_000, [0, 0])).toEqual([0, 0]);
    expect(allocate(1_000, [])).toEqual([]);
    expect(allocate(0, [3, 4])).toEqual([0, 0]);
  });

  it('keeps a negative total (a credit) adding up too', () => {
    expect(allocate(-1_000, [1, 2]).reduce((a, b) => a + b, 0)).toBe(-1_000);
  });
});

describe('the UK calendar', () => {
  it('knows the day an instant falls on in London', () => {
    expect(ukDay(at('2026-10-31T23:30:00Z'))).toBe('2026-10-31'); // still GMT
    expect(ukDay(at('2026-07-31T23:30:00Z'))).toBe('2026-08-01'); // BST: already the next day
  });

  it('starts a month at London midnight, an hour early in UTC while summer time is on', () => {
    expect(ukMonthRange('2026-07')).toEqual({
      from: at('2026-06-30T23:00:00Z'),
      to: at('2026-07-31T23:00:00Z'),
    });
    expect(ukMonthRange('2026-12')).toEqual({
      from: at('2026-12-01T00:00:00Z'),
      to: at('2027-01-01T00:00:00Z'),
    });
    // October ends the day summer time does: the month is 31 days and 1 hour long.
    const oct = ukMonthRange('2026-10');
    expect(oct.from).toEqual(at('2026-09-30T23:00:00Z'));
    expect(oct.to).toEqual(at('2026-11-01T00:00:00Z'));
  });
});

const job = (over: Partial<DeliveredJob> & { id: string }): DeliveredJob => ({
  reference: over.id.toUpperCase(),
  customer: undefined,
  pricePence: undefined,
  vehicleId: undefined,
  driverId: undefined,
  acceptedAt: undefined,
  deliveredAt: at('2026-10-10T12:00:00Z'),
  ...over,
});

const fuel = (vehicleId: typeof v1 | undefined, amountPence: number): FuelTransaction =>
  ({
    id: 'f',
    companyId: acme,
    vehicleId,
    registration: 'AB12CDE',
    amountPence,
    occurredAt: at('2026-10-05T08:00:00Z'),
    dedupeKey: 'k',
  }) as unknown as FuelTransaction;

const cost = (
  over: Partial<RunningCost> & { description: string; monthlyPence: number },
): RunningCost => ({
  id: makeId<'RunningCostId'>(`c-${over.description}`),
  companyId: acme,
  vehicleId: undefined,
  fromMonth: '2026-01',
  toMonth: undefined,
  ...over,
});

const rate = (driverId: typeof d1, hourlyPence: number, fromDay: string): DriverRate => ({
  id: makeId<'DriverRateId'>(`${driverId}-${fromDay}`),
  companyId: acme,
  driverId,
  hourlyPence,
  fromDay,
});

const names = {
  vehicleNames: new Map([
    ['v1', 'Big Wagon'],
    ['v2', 'Tipper'],
  ]),
  driverNames: new Map([
    ['d1', 'Sam'],
    ['d2', 'Kim'],
  ]),
};

describe('buildCostReport', () => {
  const report = buildCostReport({
    month: '2026-10',
    jobs: [
      job({
        id: 'j1',
        vehicleId: v1,
        driverId: d1,
        customer: 'Acme',
        pricePence: 20_000,
        acceptedAt: at('2026-10-10T08:00:00Z'),
        deliveredAt: at('2026-10-10T10:00:00Z'),
      }),
      job({
        id: 'j2',
        vehicleId: v1,
        driverId: d1,
        customer: 'Acme',
        pricePence: 40_000,
        acceptedAt: at('2026-10-12T09:00:00Z'),
        deliveredAt: at('2026-10-12T15:00:00Z'),
      }),
    ],
    fuel: [fuel(v1, 16_000), fuel(v2, 5_000), fuel(undefined, 2_000)],
    runningCosts: [
      cost({ vehicleId: v1, description: 'Insurance', monthlyPence: 18_000 }),
      cost({ vehicleId: v1, description: 'Finance', monthlyPence: 30_000 }),
      cost({ vehicleId: v2, description: 'Tipper insurance', monthlyPence: 10_000 }),
      cost({ description: 'Office rent', monthlyPence: 40_000 }),
      cost({ vehicleId: v1, description: 'Old plan', monthlyPence: 99_999, toMonth: '2026-09' }),
      cost({
        vehicleId: v1,
        description: 'Future plan',
        monthlyPence: 99_999,
        fromMonth: '2026-11',
      }),
    ],
    rates: [rate(d1, 1_500, '2026-01-01')],
    ...names,
  });

  it('shares a vehicle’s fuel and running costs across its jobs by time, to the penny, and adds wages', () => {
    const [j2, j1] = report.jobs; // newest first
    expect(j1).toMatchObject({
      reference: 'J1',
      hours: 2,
      wagesPence: 3_000,
      fuelPence: 4_000,
      runningPence: 12_000,
      costPence: 19_000,
      profitPence: 1_000,
    });
    expect(j2).toMatchObject({
      reference: 'J2',
      hours: 6,
      wagesPence: 9_000,
      fuelPence: 12_000,
      runningPence: 36_000,
      costPence: 57_000,
      profitPence: -17_000,
    });
    expect(j1?.vehicleName).toBe('Big Wagon');
    expect(j1?.driverName).toBe('Sam');
    expect(j1?.notes).toEqual([]);
  });

  it('shows each vehicle with all its costs, including one that did no job, worst first', () => {
    expect(
      report.vehicles.map((v) => [v.name, v.jobs, v.revenuePence, v.costPence, v.profitPence]),
    ).toEqual([
      ['Big Wagon', 2, 60_000, 76_000, -16_000],
      ['Tipper', 0, 0, 15_000, -15_000],
    ]);
    expect(report.vehicles[0]).toMatchObject({
      wagesPence: 12_000,
      fuelPence: 16_000,
      runningPence: 48_000,
    });
  });

  it('adds up: what the jobs carry, what no job carries, overheads on their own, and the profit', () => {
    expect(report.totals).toEqual({
      jobs: 2,
      revenuePence: 60_000,
      wagesPence: 12_000,
      fuelPence: 23_000,
      unmatchedFuelPence: 2_000,
      runningPence: 58_000,
      overheadsPence: 40_000,
      jobsCostPence: 76_000,
      notCoveredPence: 17_000,
      profitPence: -73_000,
      jobsWithoutPrice: 0,
      jobsWithoutRate: 0,
    });
  });

  it('groups by customer, and leaves out a running cost that has ended or not begun', () => {
    expect(report.customers).toEqual([
      { name: 'Acme', jobs: 2, revenuePence: 60_000, costPence: 76_000, profitPence: -16_000 },
    ]);
    expect(report.totals.runningPence).toBe(58_000);
  });

  it('uses the rate in force on the day of delivery', () => {
    const r = buildCostReport({
      month: '2026-10',
      jobs: [
        job({
          id: 'a',
          driverId: d1,
          acceptedAt: at('2026-10-02T08:00:00Z'),
          deliveredAt: at('2026-10-02T10:00:00Z'),
        }),
        job({
          id: 'b',
          driverId: d1,
          acceptedAt: at('2026-10-20T08:00:00Z'),
          deliveredAt: at('2026-10-20T10:00:00Z'),
        }),
      ],
      fuel: [],
      runningCosts: [],
      rates: [rate(d1, 1_200, '2026-01-01'), rate(d1, 1_500, '2026-10-15')],
      ...names,
    });
    expect(r.jobs.map((j) => [j.reference, j.wagesPence])).toEqual([
      ['B', 3_000],
      ['A', 2_400],
    ]);
  });

  it('says what is missing rather than guessing: no price, no rate, no driver, no vehicle, no time', () => {
    const r = buildCostReport({
      month: '2026-10',
      jobs: [
        job({
          id: 'p',
          vehicleId: v1,
          driverId: d2,
          acceptedAt: at('2026-10-02T08:00:00Z'),
          deliveredAt: at('2026-10-02T10:00:00Z'),
        }),
        job({ id: 'q', pricePence: 5_000 }),
      ],
      fuel: [fuel(v1, 1_000)],
      runningCosts: [],
      rates: [rate(d1, 1_500, '2026-01-01')],
      ...names,
    });
    const p = r.jobs.find((j) => j.reference === 'P');
    const q = r.jobs.find((j) => j.reference === 'Q');
    expect(p?.notes).toEqual(['no_price', 'no_rate']);
    expect(p).toMatchObject({ wagesPence: undefined, profitPence: undefined, fuelPence: 1_000 });
    expect(q?.notes).toEqual(['no_time', 'no_driver', 'no_vehicle']);
    expect(q).toMatchObject({ pricePence: 5_000, costPence: 0, profitPence: 5_000 });
    expect(r.totals.jobsWithoutPrice).toBe(1);
  });

  it('notes a driver with no rate, and shares equally when the vehicle’s jobs have no time at all', () => {
    const r = buildCostReport({
      month: '2026-10',
      jobs: [
        job({
          id: 'a',
          vehicleId: v1,
          driverId: d2,
          acceptedAt: at('2026-10-02T08:00:00Z'),
          deliveredAt: at('2026-10-02T09:00:00Z'),
        }),
      ],
      fuel: [],
      runningCosts: [],
      rates: [],
      ...names,
    });
    expect(r.jobs[0]?.notes).toContain('no_rate');
    expect(r.totals.jobsWithoutRate).toBe(1);

    const blind = buildCostReport({
      month: '2026-10',
      jobs: [job({ id: 'a', vehicleId: v1 }), job({ id: 'b', vehicleId: v1 })],
      fuel: [fuel(v1, 1_000)],
      runningCosts: [],
      rates: [],
      ...names,
    });
    expect(blind.jobs.map((j) => j.fuelPence)).toEqual([500, 500]);
    expect(blind.totals.notCoveredPence).toBe(0);
  });

  it('puts jobs with no vehicle on a line of their own, and is empty for a month with nothing', () => {
    const r = buildCostReport({
      month: '2026-10',
      jobs: [
        job({
          id: 'a',
          driverId: d1,
          pricePence: 9_000,
          acceptedAt: at('2026-10-02T08:00:00Z'),
          deliveredAt: at('2026-10-02T10:00:00Z'),
        }),
      ],
      fuel: [],
      runningCosts: [],
      rates: [rate(d1, 1_500, '2026-01-01')],
      ...names,
    });
    expect(r.vehicles).toEqual([
      expect.objectContaining({
        name: 'No vehicle recorded',
        vehicleId: undefined,
        revenuePence: 9_000,
        costPence: 3_000,
        profitPence: 6_000,
      }),
    ]);
    const empty = buildCostReport({
      month: '2026-10',
      jobs: [],
      fuel: [],
      runningCosts: [],
      rates: [],
      ...names,
    });
    expect(empty.totals).toMatchObject({
      jobs: 0,
      revenuePence: 0,
      profitPence: 0,
      notCoveredPence: 0,
    });
  });
});
