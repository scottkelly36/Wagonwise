import type { FastifyInstance } from 'fastify';

/**
 * Counts hits per key in fixed windows. In memory, so per instance: right for one BFF container;
 * with several, each keeps its own count (the per-account lockout in core is the real guard).
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

/** The routes where a password or a code is being tried. */
export const GUESSING_ROUTES: ReadonlySet<string> = new Set([
  '/staff/auth/sign-in',
  '/staff/auth/second-factor',
  '/staff/invites/accept',
  '/staff/invites/confirm',
]);

/** 30 tries per address per 15 minutes across those routes (P2-M1.12). */
export const GUESSES_PER_WINDOW = 30;
export const GUESS_WINDOW_MS = 15 * 60 * 1000;

/**
 * Slows one address trying many accounts or codes. Keyed on `request.ip`, which is only the real
 * caller when `trustProxy` matches the proxies in front (config `TRUST_PROXY_HOPS`); otherwise
 * every caller shares the proxy's address and one bucket.
 */
export function registerGuessingLimit(
  app: FastifyInstance,
  limiter = new FixedWindowLimiter(GUESSES_PER_WINDOW, GUESS_WINDOW_MS),
): void {
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST' || !GUESSING_ROUTES.has(request.routeOptions.url ?? '')) return;
    const { allowed, retryAfterSeconds } = limiter.hit(request.ip);
    if (!allowed) {
      await reply
        .status(429)
        .header('retry-after', String(retryAfterSeconds))
        .send({ error: 'too_many_requests', requestId: request.id });
    }
  });
}
