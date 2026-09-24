/**
 * Pulls `newRoutePlanId` out of a push notification's `data` payload (core's
 * `detect-reroute.ts` sends `data: { newRoutePlanId }`, M6.4). A plain function, not inline in
 * the listener hook, so the "is this shape actually what we expect" check is unit-testable
 * without a real `expo-notifications` event object — same split as `push-registration.ts`.
 */
export function newRoutePlanIdFrom(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>).newRoutePlanId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
