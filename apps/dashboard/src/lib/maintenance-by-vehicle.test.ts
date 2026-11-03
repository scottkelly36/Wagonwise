import type { OverviewRowDto } from '@wagonwise/contracts/maintenance';
import { describe, expect, it } from 'vitest';
import {
  countsText,
  fleetTotals,
  groupByVehicle,
  needsAttention,
  worstText,
} from './maintenance-by-vehicle';

let n = 0;
function row(vehicleId: string, itemName: string, over: Partial<OverviewRowDto>): OverviewRowDto {
  n += 1;
  return {
    vehicleId,
    vehicleName: `Vehicle ${vehicleId}`,
    registration: undefined,
    itemId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as OverviewRowDto['itemId'],
    itemName,
    dueDate: undefined,
    lastDone: undefined,
    status: 'no_date',
    daysUntil: undefined,
    ...over,
  };
}

const mot = (v: string, over: Partial<OverviewRowDto> = {}) =>
  row(v, 'MOT', { dueDate: '2027-01-01', daysUntil: 100, status: 'ok', ...over });

describe('groupByVehicle', () => {
  it('makes one line per vehicle, however many items it has', () => {
    const rows = [mot('a'), row('a', 'Service', {}), mot('b'), row('b', 'Service', {})];
    expect(groupByVehicle(rows).map((v) => [v.vehicleId, v.items.length])).toEqual([
      ['a', 2],
      ['b', 2],
    ]);
  });

  it('judges a vehicle by its worst item', () => {
    const [v] = groupByVehicle([
      mot('a'),
      row('a', 'Tax', { dueDate: '2026-10-01', daysUntil: -8, status: 'overdue' }),
      row('a', 'Service', { dueDate: '2026-11-09', daysUntil: 6, status: 'due_soon' }),
    ]);
    expect(v?.status).toBe('overdue');
    expect(v?.worst.itemName).toBe('Tax');
    expect(v?.counts).toEqual({ overdue: 1, due_soon: 1, no_date: 0, ok: 1 });
    expect(v?.items.map((i) => i.itemName)).toEqual(['Tax', 'Service', 'MOT']);
  });

  it('puts the vehicle with the longest-overdue item first, and fine vehicles last', () => {
    const rows = [
      mot('fine'),
      row('late', 'MOT', { dueDate: '2026-10-30', daysUntil: -4, status: 'overdue' }),
      row('later', 'MOT', { dueDate: '2026-09-30', daysUntil: -34, status: 'overdue' }),
      row('soon', 'MOT', { dueDate: '2026-11-08', daysUntil: 5, status: 'due_soon' }),
      row('blank', 'MOT', {}),
    ];
    expect(groupByVehicle(rows).map((v) => v.vehicleId)).toEqual([
      'later',
      'late',
      'soon',
      'blank',
      'fine',
    ]);
  });

  it('orders the items nearest their date first among those with the same status', () => {
    const [v] = groupByVehicle([
      row('a', 'B', { dueDate: '2026-11-20', daysUntil: 17, status: 'due_soon' }),
      row('a', 'A', { dueDate: '2026-11-06', daysUntil: 3, status: 'due_soon' }),
    ]);
    expect(v?.items.map((i) => i.itemName)).toEqual(['A', 'B']);
  });

  it('gives nothing for no rows', () => {
    expect(groupByVehicle([])).toEqual([]);
  });
});

describe('words and totals', () => {
  const [late, fine] = groupByVehicle([
    row('late', 'Tax', { dueDate: '2026-10-30', daysUntil: -4, status: 'overdue' }),
    row('late', 'Service', {}),
    row('late', 'Tacho', {}),
    mot('fine'),
  ]);

  it('lists only the kinds that exist', () => {
    expect(countsText(late!.counts)).toBe('1 overdue, 2 no date yet');
    expect(countsText(fine!.counts)).toBe('All fine');
  });

  it('says what the worst item is', () => {
    expect(worstText(late!)).toBe('Tax: Overdue by 4 days');
    expect(worstText(fine!)).toBe('MOT: Due 1 Jan 2027');
  });

  it('counts vehicles, not items', () => {
    expect(needsAttention(late!)).toBe(true);
    expect(needsAttention(fine!)).toBe(false);
    expect(fleetTotals([late!, fine!])).toEqual({ vehicles: 2, overdue: 1, needAttention: 1 });
  });
});
