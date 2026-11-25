import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemorySendThrottle, MAX_PER_HOUR, MIN_GAP_MS } from './in-memory-send-throttle.js';

const PHONE = '+447700900123';
const EMAIL = 'sam@example.com';

describe('InMemorySendThrottle', () => {
  it('lets the first code through and holds the next for the gap, saying how long to wait', () => {
    const clock = new FakeClock('2026-11-26T10:00:00.000Z');
    const throttle = new InMemorySendThrottle(clock, 0);
    expect(throttle.check(EMAIL)).toEqual({ allowed: true });
    clock.advance(10_000);
    expect(throttle.check(EMAIL)).toEqual({
      allowed: false,
      reason: 'too_often',
      retryAfterSeconds: 20,
    });
    clock.advance(MIN_GAP_MS - 10_000);
    expect(throttle.check(EMAIL)).toEqual({ allowed: true });
  });

  it('allows six an hour and then holds until the oldest has aged out', () => {
    const clock = new FakeClock('2026-11-26T10:00:00.000Z');
    const throttle = new InMemorySendThrottle(clock, 0);
    for (let i = 0; i < MAX_PER_HOUR; i++) {
      expect(throttle.check(EMAIL)).toEqual({ allowed: true });
      clock.advance(MIN_GAP_MS);
    }
    const held = throttle.check(EMAIL);
    expect(held.allowed).toBe(false);
    clock.advance(60 * 60 * 1000);
    expect(throttle.check(EMAIL)).toEqual({ allowed: true });
  });

  it('counts each address or number on its own', () => {
    const throttle = new InMemorySendThrottle(new FakeClock('2026-11-26T10:00:00.000Z'), 0);
    expect(throttle.check(EMAIL).allowed).toBe(true);
    expect(throttle.check('dan@example.com').allowed).toBe(true);
    expect(throttle.check(PHONE).allowed).toBe(true);
    expect(throttle.check(EMAIL).allowed).toBe(false);
  });

  it('stops texts, and only texts, when the day budget is used up, and tells the owner once', () => {
    const clock = new FakeClock('2026-11-26T10:00:00.000Z');
    let told = 0;
    const throttle = new InMemorySendThrottle(clock, 2, () => (told += 1));
    expect(throttle.check('+447700900001').allowed).toBe(true);
    expect(throttle.check('+447700900002').allowed).toBe(true);
    expect(throttle.check('+447700900003')).toEqual({
      allowed: false,
      reason: 'sms_budget',
      retryAfterSeconds: 3600,
    });
    // An email is not a text: it still goes.
    expect(throttle.check(EMAIL)).toEqual({ allowed: true });
    expect(told).toBe(1);
  });

  it('starts the text budget again the next UTC day', () => {
    const clock = new FakeClock('2026-11-26T23:30:00.000Z');
    const throttle = new InMemorySendThrottle(clock, 1);
    expect(throttle.check('+447700900001').allowed).toBe(true);
    expect(throttle.check('+447700900002').allowed).toBe(false);
    clock.set('2026-11-27T00:05:00.000Z');
    expect(throttle.check('+447700900002').allowed).toBe(true);
  });

  it('does not use up the text budget on a send it held for being too soon', () => {
    const clock = new FakeClock('2026-11-26T10:00:00.000Z');
    const throttle = new InMemorySendThrottle(clock, 2);
    expect(throttle.check(PHONE).allowed).toBe(true);
    expect(throttle.check(PHONE).allowed).toBe(false);
    expect(throttle.check(PHONE).allowed).toBe(false);
    expect(throttle.check('+447700900002').allowed).toBe(true);
  });

  it('has no text limit when the budget is 0', () => {
    const throttle = new InMemorySendThrottle(new FakeClock('2026-11-26T10:00:00.000Z'), 0);
    for (let i = 0; i < 50; i++) {
      expect(throttle.check(`+4477009${String(i).padStart(5, '0')}`).allowed).toBe(true);
    }
  });
});
