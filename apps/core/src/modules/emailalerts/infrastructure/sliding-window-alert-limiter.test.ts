import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SlidingWindowAlertLimiter } from './sliding-window-alert-limiter.js';

describe('SlidingWindowAlertLimiter', () => {
  it('allows the cap, refuses the next, and allows again once the hour has passed', () => {
    const clock = new FakeClock(new Date('2026-10-15T10:00:00.000Z'));
    const limiter = new SlidingWindowAlertLimiter(clock, 2, 60 * 60 * 1000);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    clock.advance(60 * 60 * 1000 + 1);
    expect(limiter.tryAcquire()).toBe(true);
  });
});
