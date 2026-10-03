import { useEffect } from 'react';
import { AppState } from 'react-native';

import * as jobsApi from '../api/jobs';
import { queryClient } from '../api/query-client';
import { CURRENT_JOB_KEY } from '../api/use-jobs';
import {
  listQueuedProofsOfDelivery,
  removeQueuedProofOfDelivery,
} from '../db/proof-of-delivery-queue';
import { flushQueuedProofs } from '../lib/proof-of-delivery-flush';
import { useAuthStore } from '../state/auth-store';

export const PENDING_PROOFS_KEY = ['pending-proofs-of-delivery'] as const;

// Module-level rather than a ref: the capture hook and the foreground/mount trigger below both
// call this, and two passes at once would upload the same multi-megabyte photo twice.
let syncing = false;

/** Uploads whatever's in the offline proof-of-delivery queue, then refreshes what the job screen
 *  shows. Safe to call from anywhere, any time — a pass already in flight makes this a no-op. */
export async function syncProofOfDeliveryQueue(accessToken: string): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const queued = await listQueuedProofsOfDelivery();
    if (queued.length === 0) return;
    const result = await flushQueuedProofs(queued, (item) =>
      jobsApi.attachProofOfDelivery(accessToken, item.jobId, {
        contentType: item.contentType,
        dataBase64: item.dataBase64,
      }),
    );
    for (const jobId of [...result.sent, ...result.discarded]) {
      await removeQueuedProofOfDelivery(jobId);
    }
    if (result.sent.length > 0 || result.discarded.length > 0) {
      void queryClient.invalidateQueries({ queryKey: PENDING_PROOFS_KEY });
      void queryClient.invalidateQueries({ queryKey: CURRENT_JOB_KEY });
    }
  } finally {
    syncing = false;
  }
}

/**
 * Retries the proof-of-delivery queue on mount and whenever the app comes back to the foreground
 * — the same opportunistic shape as `useHazardQueueFlush`, for the same reason (no NetInfo
 * dependency; a failed attempt is cheap and the next foreground tries again).
 */
export function useProofOfDeliveryQueueFlush(): void {
  const state = useAuthStore((s) => s.state);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    const { accessToken } = state;

    void syncProofOfDeliveryQueue(accessToken);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncProofOfDeliveryQueue(accessToken);
    });

    return () => subscription.remove();
  }, [state]);
}
