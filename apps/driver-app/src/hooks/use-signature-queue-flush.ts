import { useEffect } from 'react';
import { AppState } from 'react-native';

import * as jobsApi from '../api/jobs';
import { queryClient } from '../api/query-client';
import { CURRENT_JOB_KEY } from '../api/use-jobs';
import { listQueuedSignatures, removeQueuedSignature } from '../db/signature-queue';
import { flushQueuedSignatures } from '../lib/signature-flush';
import { useAuthStore } from '../state/auth-store';

export const PENDING_SIGNATURES_KEY = ['pending-signatures'] as const;

// Module-level, as for the photos: two passes at once would send the same signature twice.
let syncing = false;

/** Uploads whatever is in the offline signature queue, then refreshes what the job screen shows. Safe to call any time. */
export async function syncSignatureQueue(accessToken: string): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const queued = await listQueuedSignatures();
    if (queued.length === 0) return;
    const result = await flushQueuedSignatures(queued, (item) =>
      jobsApi.attachSignature(accessToken, item.jobId, {
        strokes: item.strokes,
        ...(item.signerName === undefined ? {} : { signerName: item.signerName }),
      }),
    );
    for (const jobId of [...result.sent, ...result.discarded]) {
      await removeQueuedSignature(jobId);
    }
    if (result.sent.length > 0 || result.discarded.length > 0) {
      void queryClient.invalidateQueries({ queryKey: PENDING_SIGNATURES_KEY });
      void queryClient.invalidateQueries({ queryKey: CURRENT_JOB_KEY });
    }
  } finally {
    syncing = false;
  }
}

/** Retries the signature queue on mount and whenever the app returns to the foreground. */
export function useSignatureQueueFlush(): void {
  const state = useAuthStore((s) => s.state);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    const { accessToken } = state;

    void syncSignatureQueue(accessToken);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncSignatureQueue(accessToken);
    });

    return () => subscription.remove();
  }, [state]);
}
