import type { Clock } from '../../../shared/ports/clock.js';
import type { AttemptLimiter } from './ports/attempt-limiter.js';

/**
 * Failures per key in a sliding window; at the limit the key is blocked until the oldest one ages
 * out. In memory, so per instance and gone on a restart: fine for slowing guesses at an 8-character
 * code (about 31^8 possibilities) that admits nobody without the company's approval anyway.
 */
export class SlidingWindowAttemptLimiter implements AttemptLimiter {
  readonly #failures = new Map<string, number[]>();

  constructor(
    private readonly clock: Clock,
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  isBlocked(key: string): boolean {
    return this.#recent(key).length >= this.maxFailures;
  }

  recordFailure(key: string): void {
    this.#failures.set(key, [...this.#recent(key), this.clock.now().getTime()]);
  }

  #recent(key: string): number[] {
    const cutoff = this.clock.now().getTime() - this.windowMs;
    const recent = (this.#failures.get(key) ?? []).filter((at) => at > cutoff);
    if (recent.length === 0) this.#failures.delete(key);
    return recent;
  }
}
