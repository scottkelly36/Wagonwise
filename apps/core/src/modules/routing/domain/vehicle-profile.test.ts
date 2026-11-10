import { describe, expect, it } from 'vitest';
import { validateDimensions, validateName, type Dimensions } from './vehicle-profile.js';

function dimensions(overrides: Partial<Dimensions> = {}): Dimensions {
  return { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32, ...overrides };
}

describe('validateDimensions', () => {
  it('accepts realistic HGV dimensions, with axleWeightT omitted', () => {
    const result = validateDimensions(dimensions());
    expect(result).toEqual({ ok: true, value: dimensions() });
  });

  it('accepts a positive axleWeightT', () => {
    const withAxle = dimensions({ axleWeightT: 10 });
    expect(validateDimensions(withAxle)).toEqual({ ok: true, value: withAxle });
  });

  it.each(['heightM', 'widthM', 'lengthM', 'grossWeightT'] as const)(
    'rejects a zero %s',
    (field) => {
      const result = validateDimensions(dimensions({ [field]: 0 }));
      expect(result).toEqual({
        ok: false,
        error: { tag: 'InvalidDimensions', reason: 'must_be_positive' },
      });
    },
  );

  it.each(['heightM', 'widthM', 'lengthM', 'grossWeightT'] as const)(
    'rejects a negative %s',
    (field) => {
      const result = validateDimensions(dimensions({ [field]: -1 }));
      expect(result).toEqual({
        ok: false,
        error: { tag: 'InvalidDimensions', reason: 'must_be_positive' },
      });
    },
  );

  it('rejects a zero or negative axleWeightT when present', () => {
    expect(validateDimensions(dimensions({ axleWeightT: 0 })).ok).toBe(false);
    expect(validateDimensions(dimensions({ axleWeightT: -1 })).ok).toBe(false);
  });

  it('accepts a top speed in a believable range, and none at all', () => {
    expect(validateDimensions(dimensions({ topSpeedKph: 90 }))).toEqual({
      ok: true,
      value: dimensions({ topSpeedKph: 90 }),
    });
    expect(validateDimensions(dimensions({ topSpeedKph: 30 })).ok).toBe(true);
    expect(validateDimensions(dimensions({ topSpeedKph: 130 })).ok).toBe(true);
  });

  it('rejects a top speed that is a typo (too slow, too fast, or not a number)', () => {
    expect(validateDimensions(dimensions({ topSpeedKph: 0 })).ok).toBe(false);
    expect(validateDimensions(dimensions({ topSpeedKph: 9 })).ok).toBe(false);
    expect(validateDimensions(dimensions({ topSpeedKph: 560 })).ok).toBe(false);
    expect(validateDimensions(dimensions({ topSpeedKph: Number.NaN })).ok).toBe(false);
  });

  it('rejects a non-finite dimension', () => {
    const result = validateDimensions(dimensions({ heightM: Number.NaN }));
    expect(result.ok).toBe(false);
  });
});

describe('validateName', () => {
  it('trims surrounding whitespace', () => {
    expect(validateName('  My Wagon  ')).toEqual({ ok: true, value: 'My Wagon' });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
  });
});
