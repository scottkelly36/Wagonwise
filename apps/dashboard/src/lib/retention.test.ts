import { describe, expect, it } from 'vitest';
import { PHOTO_RETENTION_CHOICES, retentionChoices } from './retention';

describe('retentionChoices', () => {
  it('offers the usual choices, with 12 months recommended', () => {
    const choices = retentionChoices(12);
    expect(choices.map((c) => c.months)).toEqual(PHOTO_RETENTION_CHOICES.map((c) => c.months));
    expect(choices.find((c) => c.months === 12)?.label).toMatch(/recommended/);
  });

  it('adds a value WagonWise set that is not one of them, in order', () => {
    expect(retentionChoices(9).map((c) => c.months)).toEqual([3, 6, 9, 12, 24, 60, 72]);
  });

  it('adds nothing before the value is known', () => {
    expect(retentionChoices(undefined)).toHaveLength(PHOTO_RETENTION_CHOICES.length);
  });
});
