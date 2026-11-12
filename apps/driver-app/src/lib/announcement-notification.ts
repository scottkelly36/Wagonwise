/**
 * Pulls the note's id out of a "what's new" push notification's `data` payload (core's `announcements` sends `data: { type: 'announcement', announcementId }`).
 * A plain function so the shape check is unit-testable without a real `expo-notifications` event, like `job-notification.ts`.
 */
export function announcementIdFrom(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const record = data as Record<string, unknown>;
  return record.type === 'announcement' &&
    typeof record.announcementId === 'string' &&
    record.announcementId !== ''
    ? record.announcementId
    : undefined;
}
