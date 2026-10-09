import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { RunningCost } from './inputs.js';
import type { CostReport } from './job-costs.js';
import {
  actualFrom,
  addMonths,
  buildOutlook,
  monthsEndingAt,
  type MonthActual,
} from './outlook.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');

const actual = (month: string, over: Partial<MonthActual> = {}): MonthActual => ({
  month,
  partial: false,
  jobs: 10,
  revenuePence: 100_000,
  wagesPence: 30_000,
  fuelPence: 20_000,
  runningPence: 10_000,
  overheadsPence: 5_000,
  costPence: 65_000,
  profitPence: 35_000,
  ...over,
});

const cost = (over: Partial<RunningCost> & { monthlyPence: number }): RunningCost => ({
  id: makeId<'RunningCostId'>(`c-${over.monthlyPence}-${over.fromMonth ?? ''}`),
  companyId: acme,
  vehicleId: undefined,
  description: 'x',
  fromMonth: '2026-01',
  toMonth: undefined,
  ...over,
});

describe('months', () => {
  it('counts back and forward across a year end', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('actualFrom', () => {
  it('takes a month’s report to a row, with the profit after every cost', () => {
    const report = {
      month: '2026-09',
      totals: {
        jobs: 4,
        revenuePence: 90_000,
        wagesPence: 20_000,
        fuelPence: 15_000,
        unmatchedFuelPence: 1_000,
        runningPence: 12_000,
        overheadsPence: 8_000,
      },
    } as unknown as CostReport;
    expect(actualFrom(report, false)).toEqual({
      month: '2026-09',
      partial: false,
      jobs: 4,
      revenuePence: 90_000,
      wagesPence: 20_000,
      fuelPence: 15_000,
      runningPence: 12_000,
      overheadsPence: 8_000,
      costPence: 55_000,
      profitPence: 35_000,
    });
  });
});

describe('buildOutlook', () => {
  const history = [
    actual('2026-05', { revenuePence: 60_000, wagesPence: 18_000, fuelPence: 12_000 }),
    actual('2026-06', { revenuePence: 90_000, wagesPence: 27_000, fuelPence: 18_000 }),
    actual('2026-07', { revenuePence: 100_000, wagesPence: 30_000, fuelPence: 20_000 }),
    actual('2026-08', { revenuePence: 110_000, wagesPence: 33_000, fuelPence: 22_000 }),
    actual('2026-09', { revenuePence: 120_000, wagesPence: 36_000, fuelPence: 24_000 }),
    actual('2026-10', { partial: true, jobs: 2, revenuePence: 10_000 }),
  ];

  it('averages the last three complete months for revenue, wages and fuel, and says which', () => {
    const outlook = buildOutlook({ history, runningCosts: [], currentMonth: '2026-10' });
    expect(outlook.forecast?.basedOn).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(outlook.forecast?.months[0]).toMatchObject({
      month: '2026-11',
      revenuePence: 110_000,
      wagesPence: 33_000,
      fuelPence: 22_000,
    });
    expect(outlook.forecast?.months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(outlook.history).toHaveLength(6);
  });

  it('takes running costs and overheads from what is already entered for each month ahead, not an average', () => {
    const outlook = buildOutlook({
      history,
      currentMonth: '2026-10',
      runningCosts: [
        cost({ vehicleId: makeId<'FleetVehicleId'>('v'), monthlyPence: 20_000 }),
        cost({ monthlyPence: 8_000 }),
        // Ends in November: not paid in December or January.
        cost({ vehicleId: makeId<'FleetVehicleId'>('v'), monthlyPence: 5_000, toMonth: '2026-11' }),
        // Starts in January.
        cost({ monthlyPence: 4_000, fromMonth: '2027-01' }),
      ],
    });
    const [nov, dec, jan] = outlook.forecast?.months ?? [];
    expect([nov?.runningPence, dec?.runningPence, jan?.runningPence]).toEqual([
      25_000, 20_000, 20_000,
    ]);
    expect([nov?.overheadsPence, dec?.overheadsPence, jan?.overheadsPence]).toEqual([
      8_000, 8_000, 12_000,
    ]);
    expect(nov?.costPence).toBe(33_000 + 22_000 + 25_000 + 8_000);
    expect(nov?.profitPence).toBe(110_000 - 88_000);
  });

  it('gives the revenue a typical month ahead needs to break even', () => {
    const outlook = buildOutlook({
      history,
      currentMonth: '2026-10',
      runningCosts: [cost({ monthlyPence: 10_000 })],
    });
    // wages 33,000 + fuel 22,000 + overheads 10,000 every month.
    expect(outlook.forecast?.breakEvenRevenuePence).toBe(65_000);
  });

  it('uses fewer months when fewer have jobs, skipping empty ones and the partial one', () => {
    const outlook = buildOutlook({
      history: [
        actual('2026-07', { jobs: 0, revenuePence: 0 }),
        actual('2026-08', { jobs: 0, revenuePence: 0 }),
        actual('2026-09', { revenuePence: 80_000 }),
        actual('2026-10', { partial: true, jobs: 5, revenuePence: 500_000 }),
      ],
      runningCosts: [],
      currentMonth: '2026-10',
    });
    expect(outlook.forecast?.basedOn).toEqual(['2026-09']);
    expect(outlook.forecast?.months[0]?.revenuePence).toBe(80_000);
  });

  it('does not invent a forecast when no complete month has any job', () => {
    const outlook = buildOutlook({
      history: [actual('2026-09', { jobs: 0 }), actual('2026-10', { partial: true })],
      runningCosts: [],
      currentMonth: '2026-10',
    });
    expect(outlook.forecast).toBeUndefined();
    expect(outlook.history).toHaveLength(2);
    expect(
      buildOutlook({ history: [], runningCosts: [], currentMonth: '2026-10' }).forecast,
    ).toBeUndefined();
  });
});
