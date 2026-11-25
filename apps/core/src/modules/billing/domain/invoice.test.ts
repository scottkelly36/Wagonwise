import { describe, expect, it } from 'vitest';
import {
  billableVehicles,
  buildUsageLines,
  daysInMonth,
  graceStart,
  monthName,
  nextMonthStart,
  previousMonth,
  trialCoversMonth,
  totalPence,
  validateManualLine,
  validateMonth,
  type VehicleUse,
} from './invoice.js';

// A vehicle as the month's records show it: when it was first used, and whether it was used in the month.
const veh = (id: string, firstDay: string, usedInMonth = true): VehicleUse => ({
  vehicleId: id,
  firstDay,
  usedInMonth,
});
const fleet = (n: number, firstDay = '2026-01-01'): VehicleUse[] =>
  Array.from({ length: n }, (_, i) => veh(`v${i}`, firstDay));

describe('buildUsageLines', () => {
  it('bills each vehicle used in the month as one whole-month line', () => {
    expect(buildUsageLines(fleet(5), 1000, '2026-10')).toEqual([
      {
        description: '5 vehicles used, October 2026',
        quantity: 5,
        unitPence: 1000,
        amountPence: 5000,
      },
    ]);
    expect(buildUsageLines(fleet(1), 1000, '2026-10')[0]?.description).toBe(
      '1 vehicle used, October 2026',
    );
  });

  it('bills a vehicle that sat idle all month nothing', () => {
    const use = [...fleet(2), veh('idle', '2026-03-01', false)];
    expect(totalPence(buildUsageLines(use, 1000, '2026-10'))).toBe(2000);
  });

  it('bills nothing when nothing was used, or when the price is nothing', () => {
    expect(buildUsageLines([], 1000, '2026-10')).toEqual([]);
    expect(buildUsageLines([veh('a', '2026-01-01', false)], 1000, '2026-10')).toEqual([]);
    expect(buildUsageLines(fleet(5), 0, '2026-10')).toEqual([]);
  });

  it('does not pro-rate: a vehicle used on the 2nd of the month costs the same as one used all month', () => {
    // Both were first used before the month, so both are a whole month. There is no part-month rate to game.
    expect(
      totalPence(
        buildUsageLines([veh('a', '2026-01-01'), veh('b', '2026-09-30')], 1000, '2026-10'),
      ),
    ).toBe(2000);
  });

  it('cannot be dodged by removing vehicles before the invoice: it reads what was used, not what is there', () => {
    // Five vehicles worked all October. Whatever the company has on 1 November, the October use is what it is.
    expect(totalPence(buildUsageLines(fleet(5), 1000, '2026-10'))).toBe(5000);
  });
});

describe("a new vehicle's first week", () => {
  it('starts the grace window 7 days before the end of the month', () => {
    expect(graceStart('2026-10')).toBe('2026-10-25'); // 31 days: the last 7 are 25 to 31
    expect(graceStart('2026-11')).toBe('2026-11-24'); // 30 days: 24 to 30
    expect(graceStart('2026-02')).toBe('2026-02-22'); // 28 days: 22 to 28
    expect(graceStart('2028-02')).toBe('2028-02-23'); // a leap year: 23 to 29
  });

  it('leaves a vehicle first used in the last 7 days of a month for the next month', () => {
    const use = [veh('old', '2026-01-01'), veh('new', '2026-10-25'), veh('later', '2026-10-31')];
    expect(billableVehicles(use, '2026-10')).toBe(1);
  });

  it('bills a vehicle first used on the day before the window, and from the next month on the one that was in it', () => {
    expect(billableVehicles([veh('a', '2026-10-24')], '2026-10')).toBe(1);
    // The vehicle first used on 28 October is a whole month in November.
    expect(billableVehicles([veh('a', '2026-10-28')], '2026-10')).toBe(0);
    expect(billableVehicles([veh('a', '2026-10-28')], '2026-11')).toBe(1);
  });

  it('does not let adding wagons at the end of the month, or taking them away, change what was used earlier', () => {
    // Three vehicles worked from August. Five more were added and used for the first time on 29 October: free for October only.
    const use = [
      ...fleet(3, '2026-08-01'),
      ...['x', 'y', 'z', 'p', 'q'].map((id) => veh(id, '2026-10-29')),
    ];
    expect(totalPence(buildUsageLines(use, 1000, '2026-10'))).toBe(3000);
    // In November every one that is used is a whole month.
    const november = use.map((v) => ({ ...v, usedInMonth: true }));
    expect(totalPence(buildUsageLines(november, 1000, '2026-11'))).toBe(8000);
  });
});

describe('where a month ends', () => {
  it('gives the first day of the next month, across a year end', () => {
    expect(nextMonthStart('2026-10')).toBe('2026-11-01');
    expect(nextMonthStart('2026-12')).toBe('2027-01-01');
    expect(nextMonthStart('2026-09')).toBe('2026-10-01');
  });
});

describe('months and manual lines', () => {
  it('names and sizes months', () => {
    expect(monthName('2026-10')).toBe('October 2026');
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-10')).toBe(31);
  });

  it('accepts real months only', () => {
    expect(validateMonth('2026-10').ok).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-1', 'October', '']) {
      expect(validateMonth(bad).ok).toBe(false);
    }
  });

  it('accepts a credit as a negative amount, and refuses blank text or fractions of a penny', () => {
    expect(validateManualLine('  Goodwill credit ', -2500)).toEqual({
      ok: true,
      value: { description: 'Goodwill credit', amountPence: -2500 },
    });
    expect(validateManualLine('   ', 100).ok).toBe(false);
    expect(validateManualLine('Set-up', 10.5).ok).toBe(false);
    expect(validateManualLine('x'.repeat(201), 100).ok).toBe(false);
  });
});

describe('a free trial and the first month billed', () => {
  it('covers the month the trial ends in and every month before, so billing starts the first full month after', () => {
    // A trial ending on 23 February is billed from March.
    expect(trialCoversMonth('2027-02-23', '2027-01')).toBe(true);
    expect(trialCoversMonth('2027-02-23', '2027-02')).toBe(true);
    expect(trialCoversMonth('2027-02-23', '2027-03')).toBe(false);
  });

  it('treats the last and the first day of a month the way the rule reads', () => {
    expect(trialCoversMonth('2027-02-28', '2027-02')).toBe(true);
    expect(trialCoversMonth('2027-03-01', '2027-03')).toBe(true);
    expect(trialCoversMonth('2027-03-01', '2027-04')).toBe(false);
  });

  it('bills a company with no trial end as usual', () => {
    expect(trialCoversMonth(null, '2027-03')).toBe(false);
    expect(trialCoversMonth(undefined, '2027-03')).toBe(false);
  });

  it('knows the month before, across a year end', () => {
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(previousMonth('2027-01')).toBe('2026-12');
    expect(previousMonth('2026-03')).toBe('2026-02');
  });
});
