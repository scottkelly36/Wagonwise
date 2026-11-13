import type { FastifyInstance } from 'fastify';

/**
 * Counts hits per key in fixed windows. In memory, so per instance: right for one BFF container;
 * with several, each keeps its own count. (The same small class as the staff BFF's; each app
 * keeps its own copy, as with config.)
 */
export class FixedWindowLimiter {
  readonly #windows = new Map<string, { start: number; hits: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; `retryAfterSeconds` is set when the key is over its limit. */
  hit(key: string): { readonly allowed: boolean; readonly retryAfterSeconds: number } {
    const now = this.now();
    if (this.#windows.size > 10_000) this.#sweep(now);
    let window = this.#windows.get(key);
    if (window === undefined || now - window.start >= this.windowMs) {
      window = { start: now, hits: 0 };
      this.#windows.set(key, window);
    }
    window.hits += 1;
    const allowed = window.hits <= this.limit;
    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.ceil((window.start + this.windowMs - now) / 1000),
    };
  }

  #sweep(now: number): void {
    for (const [key, window] of this.#windows) {
      if (now - window.start >= this.windowMs) this.#windows.delete(key);
    }
  }
}

/**
 * Routes anyone can call without being signed in, and that cost money or open an account: a code
 * by text message, a code being tried, the tester sign-up form.
 */
export const OPEN_ROUTES: ReadonlySet<string> = new Set([
  '/identity/otp/request',
  '/identity/otp/verify',
  '/identity/sign-in-options',
  '/signups',
  '/signups/remove',
]);

/** Routes that call a paid service (the voice parser, what3words) on the caller's behalf. */
export const PAID_ROUTES: ReadonlySet<string> = new Set([
  '/hazards/voice-reports/parse',
  '/what3words/to-location',
]);

/** Paths that must never be limited: the host's own health check. */
const UNLIMITED_PATHS: ReadonlySet<string> = new Set(['/health']);

const MINUTE_MS = 60 * 1000;

/**
 * The numbers are for abuse, not for ordinary use. Several drivers can share one address (a depot's
 * wifi, a mobile carrier), and a driver mid-trip makes about one call a second, so the overall limit
 * is far above one phone's use.
 */
export const LIMITS = {
  /** Every request from one address. */
  overall: { limit: 1200, windowMs: MINUTE_MS },
  /** Open routes: 40 per 15 minutes. */
  open: { limit: 40, windowMs: 15 * MINUTE_MS },
  /** Routes that call a paid service: 60 per 10 minutes. */
  paid: { limit: 60, windowMs: 10 * MINUTE_MS },
} as const;

export interface RateLimiters {
  readonly overall: FixedWindowLimiter;
  readonly open: FixedWindowLimiter;
  readonly paid: FixedWindowLimiter;
}

export function defaultLimiters(): RateLimiters {
  return {
    overall: new FixedWindowLimiter(LIMITS.overall.limit, LIMITS.overall.windowMs),
    open: new FixedWindowLimiter(LIMITS.open.limit, LIMITS.open.windowMs),
    paid: new FixedWindowLimiter(LIMITS.paid.limit, LIMITS.paid.windowMs),
  };
}

/**
 * Slows one address that makes far too many calls, and a tighter limit on the routes that cost
 * money. Keyed on `request.ip`, which is the real caller only when `trustProxy` matches the proxies
 * in front (config `TRUST_PROXY_HOPS`); with none set every caller would share the proxy's address
 * and so one bucket, which would lock everyone out together. So with no proxy configured the limit
 * is off, rather than wrong.
 */
export function registerRateLimits(
  app: FastifyInstance,
  options: { readonly behindProxy: boolean; readonly limiters?: RateLimiters },
): void {
  if (!options.behindProxy) return;
  const limiters = options.limiters ?? defaultLimiters();

  app.addHook('onRequest', async (request, reply) => {
    const route = request.routeOptions.url ?? '';
    if (UNLIMITED_PATHS.has(route)) return;

    const checks = [limiters.overall];
    if (OPEN_ROUTES.has(route)) checks.push(limiters.open);
    if (PAID_ROUTES.has(route)) checks.push(limiters.paid);

    for (const limiter of checks) {
      const { allowed, retryAfterSeconds } = limiter.hit(request.ip);
      if (!allowed) {
        request.log.warn({ route }, 'rate limit reached');
        await reply
          .status(429)
          .header('retry-after', String(retryAfterSeconds))
          .send({ error: 'too_many_requests', requestId: request.id });
        return;
      }
    }
  });
}
