/**
 * Whether a push notification's `data` payload is the tachograph download reminder (core's `expo-driver-pusher.ts` sends
 * `data: { type: 'tachograph_due' }`). A plain function so the shape check is unit-testable without a real `expo-notifications`
 * event, like `job-notification.ts`.
 */
export function isTachographReminder(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  return (data as Record<string, unknown>).type === 'tachograph_due';
}
