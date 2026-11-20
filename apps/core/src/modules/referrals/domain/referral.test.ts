import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, firmKey, makeCode, staffMayMove } from './referral.js';

describe('makeCode', () => {
  it('makes WW- and six characters from the plain alphabet', () => {
    let n = 0;
    const code = makeCode(() => (n++ % 10) / 10);
    expect(code).toMatch(/^WW-[A-HJKMNP-Z2-9]{6}$/);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });
});

describe('staffMayMove', () => {
  it('marks paid from signed up, sent from claimed, and void from anything not finished', () => {
    expect(staffMayMove('signed_up', 'reward_due')).toBe(true);
    expect(staffMayMove('claimed', 'reward_due')).toBe(false);
    expect(staffMayMove('claimed', 'sent')).toBe(true);
    expect(staffMayMove('reward_due', 'sent')).toBe(false);
    expect(staffMayMove('reward_due', 'void')).toBe(true);
    expect(staffMayMove('sent', 'void')).toBe(false);
  });
});

it('treats the same firm written differently as one firm', () => {
  expect(firmKey('Tyne Valley Haulage Ltd')).toBe(firmKey('tyne valley haulage limited'));
  expect(firmKey('A & B Transport')).toBe('abtransport');
});
