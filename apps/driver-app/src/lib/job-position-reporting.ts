import type { JobStatus } from '@wagonwise/contracts/jobs';

/** How often a position goes to the company while the driver is out on a job (design doc §6:
 *  "every 30–60s"). The shorter end: a live map that is a minute stale feels broken, and one small
 *  request every 30s is cheap. */
export const POSITION_REPORT_INTERVAL_MS = 30_000;

// Mirrors core's `TRACKED_STATUSES` (jobs/domain/job.ts), which is what actually decides — core
// refuses a position for any other status. Not `assigned`: the driver hasn't taken the job yet, so
// nobody has any business knowing where they are.
const TRACKED: readonly JobStatus[] = [
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
];

/** Whether the company can currently see this driver's position because of this job. Also what the
 *  job screen uses to tell the driver so. */
export function isTrackedStatus(status: JobStatus): boolean {
  return TRACKED.includes(status);
}

/**
 * Whether the driver's position is being sent to the company right now: the job is in a tracked
 * state AND the driver has started navigating it (a trip is running). Accepting a job is not enough:
 * a driver at home with the app open has not set off. Core still accepts a position for any tracked
 * status, which is only an upper limit; this is what the app actually does, and what it tells the
 * driver.
 */
export function isSharingPosition(status: JobStatus, navigating: boolean): boolean {
  return navigating && isTrackedStatus(status);
}
