import { describe, expect, it } from 'vitest';
import { formatPence, parsePounds, ukToday } from './money';

describe('formatPence', () => {
  it('shows pounds and pence', () => {
    expect(formatPence(1000)).toBe('£10.00');
    expect(formatPence(1050)).toBe('£10.50');
    expect(formatPence(0)).toBe('£0.00');
    expect(formatPence(123456)).toBe('£1,234.56');
  });
});

describe('parsePounds', () => {
  it('reads whole pounds, pounds and pence, and a leading £', () => {
    expect(parsePounds('10')).toBe(1000);
    expect(parsePounds('10.5')).toBe(1050);
    expect(parsePounds('£10.05')).toBe(1005);
    expect(parsePounds(' 7.99 ')).toBe(799);
    expect(parsePounds('0')).toBe(0);
  });

  it('refuses anything that is not an amount of money', () => {
    for (const bad of ['', 'ten', '-5', '10.999', '1,000', '10.', '1e3']) {
      expect(parsePounds(bad)).toBeUndefined();
    }
  });
});

describe('ukToday', () => {
  it('is the UK day, which in summer is ahead of UTC late in the evening', () => {
    expect(ukToday(new Date('2026-06-30T23:30:00.000Z'))).toBe('2026-07-01');
    expect(ukToday(new Date('2026-12-30T23:30:00.000Z'))).toBe('2026-12-30');
  });
});
