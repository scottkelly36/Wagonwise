import { describe, expect, it } from 'vitest';
import { ago, barHeights, shortDay } from './usage';

const now = new Date('2026-10-09T12:00:00.000Z');

describe('ago', () => {
  it('says how long ago in the biggest sensible unit', () => {
    expect(ago(null, now)).toBe('Never');
    expect(ago('2026-10-09T11:59:00.000Z', now)).toBe('Just now');
    expect(ago('2026-10-09T11:30:00.000Z', now)).toBe('30 minutes ago');
    expect(ago('2026-10-09T10:30:00.000Z', now)).toBe('1 hour ago');
    expect(ago('2026-10-09T07:00:00.000Z', now)).toBe('5 hours ago');
    expect(ago('2026-10-08T05:00:00.000Z', now)).toBe('1 day ago');
    expect(ago('2026-10-02T12:00:00.000Z', now)).toBe('7 days ago');
  });
});

describe('barHeights', () => {
  it('scales to the tallest, and keeps an empty series flat', () => {
    expect(barHeights([0, 2, 4])).toEqual([0, 50, 100]);
    expect(barHeights([0, 0])).toEqual([0, 0]);
    expect(barHeights([])).toEqual([]);
  });
});

describe('shortDay', () => {
  it('writes the day and month', () => {
    expect(shortDay('2026-10-09')).toBe('9 Oct');
  });
});
