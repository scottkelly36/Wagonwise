import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, formatCode, isWellFormedCode, normalizeCode } from './company-code.js';

describe('company codes', () => {
  it('reduces what a person typed to the stored form', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
  });

  it('accepts exactly eight characters from the alphabet', () => {
    expect(isWellFormedCode('ABCD2345')).toBe(true);
    expect(isWellFormedCode('ABCD234')).toBe(false);
    expect(isWellFormedCode('ABCD23456')).toBe(false);
  });

  it('turns away look-alikes (0, O, 1, I, L) so a mistyped code never reaches the database', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      expect(CODE_ALPHABET.includes(bad)).toBe(false);
      expect(isWellFormedCode(`ABCD234${bad}`)).toBe(false);
    }
  });

  it('formats for reading out', () => {
    expect(formatCode('ABCD2345')).toBe('ABCD-2345');
  });
});
