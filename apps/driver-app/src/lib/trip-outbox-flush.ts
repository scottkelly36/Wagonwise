import type { JobStatus } from '@wagonwise/contracts/jobs';

import type { PendingTripEnd } from '../db/trip-outbox';
import { isPermanentRejection } from './proof-of-delivery-flush';

export interface TripOutboxFlushResult {
  /** Trip ids whose end (and arrival, if there was one) the server has dealt with. Dropped from the queue. */
  readonly done: readonly string[];
  readonly remaining: readonly PendingTripEnd[];
}

interface Deps {
  advanceJob(jobId: string, status: JobStatus, at: string | undefined): Promise<unknown>;
  endTrip(tripId: string, endedAt: string | undefined): Promise<unknown>;
}

/**
 * Sends what the driver did offline, oldest first, one trip at a time: the arrival on the job, then the end of the trip. A refusal that
 * retrying cannot fix (the job moved on, the trip is already over or not this driver's) counts as dealt with, since nothing the app sends
 * will change the answer; anything else (no signal, a server error, a token about to refresh) stops the pass and leaves the rest queued, in order.
 */
export async function flushTripOutbox(
  queued: readonly PendingTripEnd[],
  deps: Deps,
): Promise<TripOutboxFlushResult> {
  const done: string[] = [];
  for (let index = 0; index < queued.length; index++) {
    const item = queued[index];
    if (item === undefined) continue;
    try {
      if (item.jobAdvance !== undefined) {
        try {
          await deps.advanceJob(item.jobAdvance.jobId, item.jobAdvance.status, item.endedAt);
        } catch (error) {
          if (!isPermanentRejection(error)) throw error;
        }
      }
      try {
        await deps.endTrip(item.tripId, item.endedAt);
      } catch (error) {
        if (!isPermanentRejection(error)) throw error;
      }
      done.push(item.tripId);
    } catch {
      return { done, remaining: queued.slice(index) };
    }
  }
  return { done, remaining: [] };
}
