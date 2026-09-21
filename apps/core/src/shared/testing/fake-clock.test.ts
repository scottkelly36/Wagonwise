import { describe, expect, it } from 'vitest';
import { FakeClock } from './fake-clock.js';

describe('FakeClock', () => {
  it('stays put until told to move', () => {
    const clock = new FakeClock('2026-03-01T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-03-01T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('advances by milliseconds', () => {
    const clock = new FakeClock('2026-03-01T12:00:00.000Z');
    clock.advance(7 * 24 * 60 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-03-08T12:00:00.000Z');
  });

  it('can be set outright', () => {
    const clock = new FakeClock();
    clock.set('2027-01-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('hands out copies, so a caller cannot move the clock by mutating what it got', () => {
    const clock = new FakeClock('2026-03-01T12:00:00.000Z');
    clock.now().setFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });
});
