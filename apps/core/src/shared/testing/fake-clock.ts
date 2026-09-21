import type { Clock } from '../ports/clock.js';

/** A clock that only moves when told to, for deterministic expiry and rate-limit tests. */
export class FakeClock implements Clock {
  #now: Date;

  constructor(start: Date | string = '2026-01-01T00:00:00.000Z') {
    this.#now = new Date(start);
  }

  /** Returns a copy: `Date` is mutable, and callers must not be able to move our time. */
  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }

  set(time: Date | string): void {
    this.#now = new Date(time);
  }
}
