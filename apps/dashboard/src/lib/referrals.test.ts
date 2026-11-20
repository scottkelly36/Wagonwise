import { describe, expect, it } from 'vitest';
import { nextActions, normaliseCode } from './referrals';

describe('nextActions', () => {
  it('offers paid and not qualifying while signed up, sent once claimed, nothing when finished', () => {
    expect(nextActions('signed_up').map((a) => a.to)).toEqual(['reward_due', 'void']);
    expect(nextActions('reward_due').map((a) => a.to)).toEqual(['void']);
    expect(nextActions('claimed').map((a) => a.to)).toEqual(['sent', 'void']);
    expect(nextActions('sent')).toEqual([]);
    expect(nextActions('void')).toEqual([]);
  });
});

it('tidies a typed code', () => {
  expect(normaliseCode(' ww-k7q2mx ')).toBe('WW-K7Q2MX');
  expect(normaliseCode('wwk7q2mx')).toBe('WW-K7Q2MX');
  expect(normaliseCode('k7q 2mx')).toBe('WW-K7Q2MX');
});
