import { describe, expect, it } from 'vitest';
import { isFuelType, isPlausiblePencePerLitre, isPlausibleUkPosition } from './fuel.js';

describe('isFuelType', () => {
  it('knows the six grades Fuel Finder reports, in capitals', () => {
    for (const type of ['E10', 'E5', 'B7_STANDARD', 'B7_PREMIUM', 'B10', 'HVO']) {
      expect(isFuelType(type)).toBe(true);
    }
  });

  it('does not know a grade it was not told about', () => {
    expect(isFuelType('B7_Standard')).toBe(false);
    expect(isFuelType('LPG')).toBe(false);
    expect(isFuelType('')).toBe(false);
  });
});

describe('isPlausibleUkPosition', () => {
  it('accepts places from Land’s End to Shetland, and Belfast', () => {
    expect(isPlausibleUkPosition({ lat: 50.07, lon: -5.7 })).toBe(true);
    expect(isPlausibleUkPosition({ lat: 60.15, lon: -1.15 })).toBe(true);
    expect(isPlausibleUkPosition({ lat: 54.6, lon: -5.93 })).toBe(true);
    expect(isPlausibleUkPosition({ lat: 54.97, lon: -2.1 })).toBe(true);
  });

  it('refuses zero, swapped and far-off coordinates', () => {
    expect(isPlausibleUkPosition({ lat: 0, lon: 0 })).toBe(false);
    expect(isPlausibleUkPosition({ lat: -2.1, lon: 54.97 })).toBe(false);
    expect(isPlausibleUkPosition({ lat: 48.85, lon: 2.35 })).toBe(false);
    expect(isPlausibleUkPosition({ lat: Number.NaN, lon: -2 })).toBe(false);
  });
});

describe('isPlausiblePencePerLitre', () => {
  it('accepts ordinary pump prices', () => {
    expect(isPlausiblePencePerLitre(198.9)).toBe(true);
    expect(isPlausiblePencePerLitre(132)).toBe(true);
  });

  it('refuses a price typed in pounds, one with an extra digit, or one that is not a number', () => {
    expect(isPlausiblePencePerLitre(1.99)).toBe(false);
    expect(isPlausiblePencePerLitre(1989)).toBe(false);
    expect(isPlausiblePencePerLitre(0)).toBe(false);
    expect(isPlausiblePencePerLitre(Number.NaN)).toBe(false);
  });
});
