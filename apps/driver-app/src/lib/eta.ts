/** Estimated arrival: `leaveAt` plus the route's duration. Pure so it's easy to test, and
 *  reusable once a live trip needs to keep recalculating it against remaining distance. */
export function computeEta(leaveAt: Date, durationMin: number): Date {
  return new Date(leaveAt.getTime() + durationMin * 60_000);
}
