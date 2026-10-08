import { useEffect } from 'react';
import { AppState } from 'react-native';

import * as checksApi from '../api/checks';
import { queryClient } from '../api/query-client';
import { listQueuedChecks, removeQueuedCheck, removeQueuedCheckPhoto } from '../db/check-queue';
import { flushQueuedChecks } from '../lib/check-queue-flush';
import { useAuthStore } from '../state/auth-store';

export const PENDING_CHECKS_KEY = ['pending-checks'] as const;
export const CHECKS_DUE_KEY = ['checks-due'] as const;

// Module-level rather than a ref, for the same reason as the proof-of-delivery queue: the screen that finishes a
// check and the foreground trigger below both call this, and two passes at once would send the same photos twice.
let syncing = false;

/** Sends whatever is in the offline check queue, then refreshes what the screens show. Safe to call from anywhere,
 *  any time: a pass already in flight makes this a no-op. */
export async function syncCheckQueue(accessToken: string): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const queued = await listQueuedChecks();
    if (queued.length === 0) return;
    const result = await flushQueuedChecks(
      queued,
      (request) => checksApi.submitCheck(accessToken, request),
      (checkId, photo) =>
        checksApi.attachCheckPhoto(accessToken, checkId, photo.itemId, {
          contentType: photo.contentType,
          dataBase64: photo.dataBase64,
        }),
    );
    for (const { checkId, itemId } of result.photosDone) {
      await removeQueuedCheckPhoto(checkId, itemId);
    }
    for (const checkId of [...result.sent, ...result.discarded]) {
      await removeQueuedCheck(checkId);
    }
    void queryClient.invalidateQueries({ queryKey: PENDING_CHECKS_KEY });
    void queryClient.invalidateQueries({ queryKey: CHECKS_DUE_KEY });
  } finally {
    syncing = false;
  }
}

/**
 * Retries the check queue on mount and whenever the app comes back to the foreground: the same opportunistic shape
 * as the other offline queues (no connectivity dependency; a failed attempt is cheap and the next foreground tries
 * again).
 */
export function useCheckQueueFlush(): void {
  const state = useAuthStore((s) => s.state);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    const { accessToken } = state;

    void syncCheckQueue(accessToken);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncCheckQueue(accessToken);
    });

    return () => subscription.remove();
  }, [state]);
}
