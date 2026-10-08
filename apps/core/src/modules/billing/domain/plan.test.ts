import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  capacityOn,
  nextChangeAfter,
  ukDay,
  validateCapacity,
  validateDay,
  validatePrice,
  type CapacityChange,
} from './plan.js';

const company = makeId<'CompanyId'>('c1');
const change = (effectiveFrom: string, capacity: number): CapacityChange => ({
  companyId: company,
  effectiveFrom,
  capacity,
});

describe('capacityOn', () => {
  const changes = [change('2026-12-01', 8), change('2026-11-01', 5)];

  it('is 0 before any change has started, and for a company with none', () => {
    expect(capacityOn(changes, '2026-10-31')).toBe(0);
    expect(capacityOn([], '2026-11-01')).toBe(0);
  });

  it('uses the latest change that has started, whatever order they are held in', () => {
    expect(capacityOn(changes, '2026-11-01')).toBe(5);
    expect(capacityOn(changes, '2026-11-30')).toBe(5);
    expect(capacityOn(changes, '2026-12-01')).toBe(8);
    expect(capacityOn(changes, '2027-06-01')).toBe(8);
  });

  it('can go down as well as up', () => {
    expect(capacityOn([change('2026-11-01', 8), change('2026-12-01', 3)], '2026-12-15')).toBe(3);
  });
});

describe('nextChangeAfter', () => {
  it('finds the soonest change still to come', () => {
    const changes = [change('2027-01-01', 9), change('2026-12-01', 8), change('2026-11-01', 5)];
    expect(nextChangeAfter(changes, '2026-11-15')?.effectiveFrom).toBe('2026-12-01');
    expect(nextChangeAfter(changes, '2027-01-01')).toBeUndefined();
  });
});

describe('ukDay', () => {
  it('is the UK calendar day, not the UTC one', () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in British Summer Time.
    expect(ukDay(new Date('2026-06-30T23:30:00.000Z'))).toBe('2026-07-01');
    // In winter the two agree.
    expect(ukDay(new Date('2026-12-30T23:30:00.000Z'))).toBe('2026-12-30');
  });
});

describe('validation', () => {
  it('accepts whole pence and whole vehicles within range, and nothing else', () => {
    expect(validatePrice(1000).ok).toBe(true);
    expect(validatePrice(0).ok).toBe(true);
    for (const bad of [-1, 10.5, Number.NaN, 1_000_001]) expect(validatePrice(bad).ok).toBe(false);
    expect(validateCapacity(5).ok).toBe(true);
    for (const bad of [-1, 2.5, 10_001]) expect(validateCapacity(bad).ok).toBe(false);
  });

  it('accepts real calendar days only', () => {
    expect(validateDay('2026-11-01').ok).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '1 Nov 2026', '2026-1-1', '']) {
      expect(validateDay(bad).ok).toBe(false);
    }
  });
});
