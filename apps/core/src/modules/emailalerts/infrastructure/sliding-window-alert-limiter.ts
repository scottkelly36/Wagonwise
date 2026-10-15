import type { Clock } from '../../../shared/ports/clock.js';
import type { AlertLimiter } from '../application/report-email-problem.js';

/** At most `max` alerts in any `windowMs`. In memory, so per instance and cleared by a restart: enough to keep a bad hour to a
 *  few emails. */
export class SlidingWindowAlertLimiter implements AlertLimiter {
  #sent: number[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly max = 5,
    private readonly windowMs = 60 * 60 * 1000,
  ) {}

  tryAcquire(): boolean {
    const now = this.clock.now().getTime();
    this.#sent = this.#sent.filter((at) => at > now - this.windowMs);
    if (this.#sent.length >= this.max) return false;
    this.#sent.push(now);
    return true;
  }
}
