// The design doc's own rule: "the app refreshes its access token opportunistically, never
// only on a 401 — otherwise it discovers the expiry in a dead zone on the A69." Pure functions
// so the scheduling math is testable without timers, AppState mocks or a rendered component.

/** Refresh this long before the access token's real expiry — a safety margin, not a guess at
 *  network latency: 15-minute tokens (decision 1) with a 2-minute margin still refresh with
 *  13 minutes of genuine slack. */
export const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/** How long to wait before the next proactive refresh. An unreadable/missing expiry (a
 *  malformed token should never happen, but this app can't verify one — see lib/jwt.ts)
 *  refreshes immediately rather than never, since "sign out unexpectedly" is worse than "one
 *  extra refresh call." */
export function refreshDelayMs(expiryMs: number | undefined, nowMs: number): number {
  if (expiryMs === undefined) return 0;
  return Math.max(0, expiryMs - REFRESH_MARGIN_MS - nowMs);
}

/** Whether resuming from the background should trigger an immediate refresh — covers the case
 *  where the scheduled timer never fired because the app (and its JS timers) were suspended. */
export function shouldRefreshOnResume(expiryMs: number | undefined, nowMs: number): boolean {
  if (expiryMs === undefined) return true;
  return expiryMs - nowMs <= REFRESH_MARGIN_MS;
}
