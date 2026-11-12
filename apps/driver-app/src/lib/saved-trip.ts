import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';

import type { PendingTripEnd } from '../db/trip-outbox';
import type { SavedTrip } from '../db/saved-trip';

/** A trip is not brought back from the phone after this long: a lorry is not on one trip for a day, so it is a trip someone forgot. */
export const SAVED_TRIP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the trip saved on the phone can be picked up again: it is this driver's, it is not a day old, and the driver has not already
 * ended it with no signal (an end waiting to be sent means the trip is over, whatever the server has yet to hear).
 */
export function usableSavedTrip(
  saved: SavedTrip | undefined,
  driverId: string,
  pending: readonly PendingTripEnd[],
  now: Date = new Date(),
): SavedTrip | undefined {
  if (saved === undefined) return undefined;
  if (saved.trip.driverId !== driverId) return undefined;
  if (saved.trip.endedAt !== undefined) return undefined;
  const age = now.getTime() - Date.parse(saved.savedAt);
  if (!Number.isFinite(age) || age < 0 || age > SAVED_TRIP_MAX_AGE_MS) return undefined;
  if (pending.some((item) => item.tripId === saved.trip.id)) return undefined;
  return saved;
}

/**
 * The job as the driver left it: while an arrival is waiting to be sent, the job shows the status the driver moved it to, so the job screen
 * offers the next step rather than going back to "Start". Once the server has it, the real job takes over.
 */
export function withPendingArrival(
  job: JobDto,
  advances: Readonly<Record<string, JobStatus>>,
): JobDto {
  const status = advances[job.id];
  return status === undefined || status === job.status ? job : { ...job, status };
}

/** The status each job with an arrival waiting to be sent has been moved to. */
export function pendingArrivals(pending: readonly PendingTripEnd[]): Record<string, JobStatus> {
  const advances: Record<string, JobStatus> = {};
  for (const item of pending) {
    if (item.jobAdvance !== undefined) advances[item.jobAdvance.jobId] = item.jobAdvance.status;
  }
  return advances;
}
