/**
 * The day the over-the-air update the phone is running was published, as YYYY-MM-DD (UTC), for the flow events: the store version
 * stays the same across over-the-air releases, so this is what tells them apart on the usage page. Undefined when the store build's
 * own code is running (no update applied) or the time is unknown. The same for everyone on that update, so it says nothing about a
 * person.
 */
export function updateDay(
  createdAt: Date | null | undefined,
  embedded: boolean,
): string | undefined {
  if (embedded || createdAt === null || createdAt === undefined) return undefined;
  const t = createdAt.getTime();
  return Number.isFinite(t) ? createdAt.toISOString().slice(0, 10) : undefined;
}
