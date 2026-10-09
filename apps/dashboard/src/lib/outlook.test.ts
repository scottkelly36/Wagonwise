import type { MonthActualDto, MonthForecastDto, OutlookDto } from '@wagonwise/contracts/costing';
import { describe, expect, it } from 'vitest';
import { applyWhatIf, breakEven, chartMonths, forecastWith, isChanged, NO_CHANGE } from './outlook';

const month = (over: Partial<MonthForecastDto> = {}): MonthForecastDto => ({
  month: '2026-11',
  revenuePence: 100_000,
  wagesPence: 30_000,
  fuelPence: 20_000,
  runningPence: 10_000,
  overheadsPence: 5_000,
  costPence: 65_000,
  profitPence: 35_000,
  ...over,
});

describe('applyWhatIf', () => {
  it('changes nothing for no change', () => {
    expect(applyWhatIf(month(), NO_CHANGE)).toEqual(month());
    expect(isChanged(NO_CHANGE)).toBe(false);
  });

  it('moves revenue, fuel and wages, leaves what is already known, and works the profit out again', () => {
    const w = { revenuePct: 10, fuelPct: 20, wagesPct: -10 };
    const m = applyWhatIf(month(), w);
    expect(m).toMatchObject({
      revenuePence: 110_000,
      fuelPence: 24_000,
      wagesPence: 27_000,
      runningPence: 10_000,
      overheadsPence: 5_000,
      costPence: 66_000,
      profitPence: 44_000,
    });
    expect(isChanged(w)).toBe(true);
  });

  it('rounds to whole pence', () => {
    const m = applyWhatIf(month({ revenuePence: 333 }), {
      revenuePct: 10,
      fuelPct: 0,
      wagesPct: 0,
    });
    expect(Number.isInteger(m.revenuePence)).toBe(true);
    expect(m.revenuePence).toBe(366);
  });
});

describe('breakEven', () => {
  it('is the average cost of the months, and nothing for no months', () => {
    expect(breakEven([month({ costPence: 60_000 }), month({ costPence: 70_000 })])).toBe(65_000);
    expect(breakEven([])).toBe(0);
  });
});

const actual = (m: string, over: Partial<MonthActualDto> = {}): MonthActualDto => ({
  month: m,
  partial: false,
  jobs: 3,
  revenuePence: 100_000,
  wagesPence: 30_000,
  fuelPence: 20_000,
  runningPence: 10_000,
  overheadsPence: 5_000,
  costPence: 65_000,
  profitPence: 35_000,
  ...over,
});

describe('chartMonths', () => {
  it('draws history then forecast, bars as a share of the biggest figure, and marks which are which', () => {
    const chart = chartMonths(
      [actual('2026-09', { revenuePence: 200_000 }), actual('2026-10', { partial: true })],
      [month({ month: '2026-11' })],
    );
    expect(chart.map((c) => [c.month, c.forecast, c.partial])).toEqual([
      ['2026-09', false, false],
      ['2026-10', false, true],
      ['2026-11', true, false],
    ]);
    expect(chart[0]?.revenue).toBe(1);
    expect(chart[2]?.revenue).toBeCloseTo(0.5);
    expect(chart[2]?.cost).toBeCloseTo(65_000 / 200_000);
  });

  it('copes with nothing at all', () => {
    expect(chartMonths([], [])).toEqual([]);
  });
});

describe('forecastWith', () => {
  const outlook: OutlookDto = {
    history: [],
    forecast: {
      basedOn: ['2026-10'],
      months: [
        month({ month: '2026-11' }),
        month({ month: '2026-12' }),
        month({ month: '2027-01' }),
      ],
      breakEvenRevenuePence: 65_000,
    },
  };

  it('adds the what-if to each month and totals the profit and the break-even', () => {
    const base = forecastWith(outlook, NO_CHANGE);
    expect(base).toMatchObject({
      totalProfitPence: 105_000,
      breakEvenRevenuePence: 65_000,
      revenuePence: 100_000,
    });
    const worse = forecastWith(outlook, { revenuePct: -20, fuelPct: 0, wagesPct: 0 });
    expect(worse).toMatchObject({ totalProfitPence: 3 * (80_000 - 65_000), revenuePence: 80_000 });
  });

  it('says nothing when there is no forecast', () => {
    expect(forecastWith({ history: [], forecast: undefined }, NO_CHANGE)).toBeUndefined();
  });
});
