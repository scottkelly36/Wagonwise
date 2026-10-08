import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  buildPlanLines,
  daysInMonth,
  monthName,
  totalPence,
  validateManualLine,
  validateMonth,
} from './invoice.js';
import type { CapacityChange } from './plan.js';

const company = makeId<'CompanyId'>('c1');
const change = (effectiveFrom: string, capacity: number): CapacityChange => ({
  companyId: company,
  effectiveFrom,
  capacity,
});

describe('buildPlanLines', () => {
  it('bills a steady capacity as one whole-month line', () => {
    const lines = buildPlanLines([change('2026-09-15', 5)], 1000, '2026-10');
    expect(lines).toEqual([
      {
        description: '5 vehicles covered, October 2026',
        quantity: 5,
        unitPence: 1000,
        amountPence: 5000,
      },
    ]);
  });

  it('uses the capacity in force on the 1st, even when it was set long before', () => {
    expect(totalPence(buildPlanLines([change('2026-01-01', 3)], 1500, '2026-10'))).toBe(4500);
  });

  it('bills nothing for a company with no capacity yet', () => {
    expect(buildPlanLines([], 1000, '2026-10')).toEqual([]);
    expect(buildPlanLines([change('2026-11-01', 5)], 1000, '2026-10')).toEqual([]);
  });

  it('bills the extra vehicles pro rata from the day capacity rises', () => {
    // October has 31 days; from the 17th is 15 days. 3 extra at £10: 3 × 1000 × 15 / 31 = 1451.61…
    const lines = buildPlanLines(
      [change('2026-09-01', 5), change('2026-10-17', 8)],
      1000,
      '2026-10',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual({
      description: '3 vehicles added from 17 October 2026 (15 of 31 days)',
      quantity: 3,
      unitPence: 1000,
      amountPence: 1452,
    });
    expect(totalPence(lines)).toBe(5000 + 1452);
  });

  it('bills a rise on the 1st as part of the base, not as an extra', () => {
    const lines = buildPlanLines([change('2026-10-01', 8)], 1000, '2026-10');
    expect(lines).toHaveLength(1);
    expect(totalPence(lines)).toBe(8000);
  });

  it('does not reduce the bill for a fall part-way through; it takes effect next month', () => {
    const changes = [change('2026-09-01', 8), change('2026-10-10', 3)];
    expect(totalPence(buildPlanLines(changes, 1000, '2026-10'))).toBe(8000);
    expect(totalPence(buildPlanLines(changes, 1000, '2026-11'))).toBe(3000);
  });

  it('bills a rise only above the level already billed for the month', () => {
    // 5 at the start, a fall to 3 (ignored), then a rise to 4 (still under the 5 already billed), then 7.
    const changes = [
      change('2026-09-01', 5),
      change('2026-10-05', 3),
      change('2026-10-10', 4),
      change('2026-10-21', 7),
    ];
    const lines = buildPlanLines(changes, 1000, '2026-10');
    expect(lines.map((l) => l.quantity)).toEqual([5, 2]);
    expect(lines[1]?.amountPence).toBe(Math.round((2 * 1000 * 11) / 31));
  });

  it('ignores changes in other months and handles a short month', () => {
    const changes = [change('2026-01-01', 4), change('2026-03-20', 6), change('2026-12-01', 99)];
    // February 2026 has 28 days; the rise on 20 March is not this month's.
    expect(totalPence(buildPlanLines(changes, 1000, '2026-02'))).toBe(4000);
    // 28 days, from the 15th is 14 days: 2 extra × 1000 × 14 / 28 = 1000.
    const feb = buildPlanLines([change('2026-01-01', 4), change('2026-02-15', 6)], 1000, '2026-02');
    expect(feb[1]?.amountPence).toBe(1000);
  });

  it('bills a price of nothing as nothing', () => {
    expect(totalPence(buildPlanLines([change('2026-01-01', 5)], 0, '2026-10'))).toBe(0);
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
