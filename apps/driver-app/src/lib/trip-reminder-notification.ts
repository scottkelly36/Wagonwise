/**
 * Pulls the trip's id out of a "still on your trip?" reminder's `data` payload (core's `routing` sends
 * `data: { type: 'trip-reminder', tripId }`). Tapping one needs no handling: opening the app brings back a running trip on the
 * trip screen, where End trip is. This only lets the app keep it quiet when it arrives while the app is open.
 */
export function tripReminderIdFrom(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const record = data as Record<string, unknown>;
  return record.type === 'trip-reminder' &&
    typeof record.tripId === 'string' &&
    record.tripId !== ''
    ? record.tripId
    : undefined;
}
