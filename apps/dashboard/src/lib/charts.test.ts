import { describe, expect, it } from 'vitest';
import { barShare, columnShare, compact, heatOpacity, niceCeil, yTicks } from './charts';

describe('niceCeil', () => {
  it('rounds up to 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(11)).toBe(20);
    expect(niceCeil(61)).toBe(100);
    expect(niceCeil(480)).toBe(500);
    expect(niceCeil(0.4)).toBe(0.5);
  });
});

describe('yTicks', () => {
  it('gives zero, a middle and the top, with whole-number gridlines', () => {
    expect(yTicks(61)).toEqual([0, 50, 100]);
    expect(yTicks(3)).toEqual([0, 3, 5]);
    expect(yTicks(0)).toEqual([0, 1]);
    expect(yTicks(1)).toEqual([0, 1]);
  });
});

describe('compact', () => {
  it('writes whole numbers in full under ten thousand, then compactly', () => {
    expect(compact(9999)).toBe('9999');
    expect(compact(12_400)).toBe('12K');
    expect(compact(2_500_000)).toBe('2.5M');
  });
});

describe('shares', () => {
  it('measures a column against the top of the scale', () => {
    expect(columnShare(5, 10)).toBe(0.5);
    expect(columnShare(0, 10)).toBe(0);
    expect(columnShare(20, 10)).toBe(1);
    expect(columnShare(5, 0)).toBe(0);
  });

  it('measures a bar against its whole, never past it', () => {
    expect(barShare(1, 4)).toBe(0.25);
    expect(barShare(5, 4)).toBe(1);
    expect(barShare(1, 0)).toBe(0);
  });

  it('fills a heat cell more the bigger its share, leaves a missing one empty and keeps a zero faint', () => {
    expect(heatOpacity(null)).toBe(0);
    expect(heatOpacity(0)).toBe(0.06);
    expect(heatOpacity(1)).toBe(1);
    expect(heatOpacity(0.5)).toBeGreaterThan(heatOpacity(0.1));
  });
});
