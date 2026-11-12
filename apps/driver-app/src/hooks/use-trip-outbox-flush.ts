import { useEffect } from 'react';
import { AppState } from 'react-native';

import * as jobsApi from '../api/jobs';
import { queryClient } from '../api/query-client';
import * as routingApi from '../api/routing';
import { CURRENT_JOB_KEY } from '../api/use-jobs';
import {
  enqueueTripEnd,
  listPendingTripEnds,
  removePendingTripEnd,
  type PendingTripEnd,
} from '../db/trip-outbox';
import { pendingArrivals } from '../lib/saved-trip';
import { flushTripOutbox } from '../lib/trip-outbox-flush';
import { useAuthStore } from '../state/auth-store';
import { usePendingArrivalsStore } from '../state/pending-arrivals-store';

/** Reloads the arrivals waiting to be sent into the store the job screen reads. */
export async function refreshPendingArrivals(): Promise<void> {
  usePendingArrivalsStore.getState().setAdvances(pendingArrivals(await listPendingTripEnds()));
}

/** Saves an end (and, for a job, the arrival) to send when there is signal, and shows the arrival on the job meanwhile. */
export async function queueTripEnd(item: PendingTripEnd): Promise<void> {
  await enqueueTripEnd(item);
  await refreshPendingArrivals();
}

// Module-level: two passes at once would send the same end twice.
let syncing = false;

/** Sends whatever the driver did offline, then refreshes the job. Safe to call any time; with an empty token (no sign-in refreshed yet) it does nothing. */
export async function syncTripOutbox(accessToken: string): Promise<void> {
  if (accessToken === '' || syncing) return;
  syncing = true;
  try {
    const queued = await listPendingTripEnds();
    if (queued.length === 0) return;
    const result = await flushTripOutbox(queued, {
      advanceJob: (jobId, status) => jobsApi.advanceJobStatus(accessToken, jobId, { status }),
      endTrip: (tripId) => routingApi.endTrip(accessToken, tripId),
    });
    for (const tripId of result.done) await removePendingTripEnd(tripId);
    if (result.done.length > 0) {
      await refreshPendingArrivals();
      void queryClient.invalidateQueries({ queryKey: CURRENT_JOB_KEY });
    }
  } finally {
    syncing = false;
  }
}

/** Shows what is waiting on opening the app, and retries sending it on mount and whenever the app returns to the foreground. */
export function useTripOutboxFlush(): void {
  const state = useAuthStore((s) => s.state);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    const { accessToken } = state;

    void refreshPendingArrivals().catch(() => undefined);
    void syncTripOutbox(accessToken).catch(() => undefined);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncTripOutbox(accessToken).catch(() => undefined);
    });

    return () => subscription.remove();
  }, [state]);
}
