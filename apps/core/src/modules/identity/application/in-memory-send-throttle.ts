import type { Clock } from '../../../shared/ports/clock.js';
import type { SendThrottle, SendVerdict } from './ports/send-throttle.js';

/** A code at most this often to one address or number: long enough to stop a flood, shorter than a person takes to retype it. */
export const MIN_GAP_MS = 30 * 1000;
/** And at most this many in an hour. A driver who cannot get a code in six tries needs a person, not a seventh. */
export const MAX_PER_HOUR = 6;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Per-identifier limits, and a budget of text messages a UTC day across everyone. In memory, so per instance: core is run as one
 * instance (docs/deployment-guide.md), and a restart only forgets the last hour, which an attacker cannot cause. Emails do not use the
 * text budget (they cost almost nothing), but have the same per-address limits.
 */
export class InMemorySendThrottle implements SendThrottle {
  readonly #sent = new Map<string, number[]>();
  #day = '';
  #texts = 0;

  constructor(
    private readonly clock: Clock,
    /** Texts a UTC day. 0 or less means no limit (a test, or an owner who sets none). */
    private readonly dailyTexts: number,
    /** Told once when the day's texts first run out, so the owner hears of it. */
    private readonly onTextBudgetUsed?: () => void,
  ) {}

  check(identifier: string): SendVerdict {
    const now = this.clock.now().getTime();
    const recent = (this.#sent.get(identifier) ?? []).filter((t) => now - t < HOUR_MS);
    const last = recent[recent.length - 1];
    if (last !== undefined && now - last < MIN_GAP_MS) {
      return {
        allowed: false,
        reason: 'too_often',
        retryAfterSeconds: Math.ceil((MIN_GAP_MS - (now - last)) / 1000),
      };
    }
    const first = recent[0];
    if (recent.length >= MAX_PER_HOUR && first !== undefined) {
      return {
        allowed: false,
        reason: 'too_often',
        retryAfterSeconds: Math.ceil((HOUR_MS - (now - first)) / 1000),
      };
    }
    if (!identifier.includes('@') && this.dailyTexts > 0) {
      const day = this.clock.now().toISOString().slice(0, 10);
      if (day !== this.#day) {
        this.#day = day;
        this.#texts = 0;
      }
      if (this.#texts >= this.dailyTexts) {
        this.onTextBudgetUsed?.();
        return { allowed: false, reason: 'sms_budget', retryAfterSeconds: 60 * 60 };
      }
      this.#texts += 1;
    }
    recent.push(now);
    this.#sent.set(identifier, recent);
    if (this.#sent.size > 20_000) this.#sweep(now);
    return { allowed: true };
  }

  #sweep(now: number): void {
    for (const [key, times] of this.#sent) {
      if (times.every((t) => now - t >= HOUR_MS)) this.#sent.delete(key);
    }
  }
}
