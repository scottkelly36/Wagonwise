import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import * as hazardsApi from '../api/hazards';
import { listQueuedHazardReports, removeQueuedHazardReport } from '../db/hazard-queue';
import { flushQueuedReports } from '../lib/hazard-queue-flush';
import { useAuthStore } from '../state/auth-store';

/**
 * Sends whatever's in the offline hazard queue whenever there's a reasonable chance of being
 * online: on mount, and whenever the app returns to the foreground — same "opportunistic, not
 * just on one trigger" shape as `useOpportunisticRefresh` (M5.2), for the same underlying reason
 * (a scheduled/one-shot trigger can be missed while the app is suspended). No push-based network
 * listener (e.g. NetInfo) — a failed attempt is cheap and the next foreground/mount will try
 * again, so polling-by-opportunity is enough for Phase 1 rather than a new dependency.
 */
export function useHazardQueueFlush(): void {
  const state = useAuthStore((s) => s.state);
  const flushingRef = useRef(false);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    const { accessToken } = state;

    async function flushNow(): Promise<void> {
      if (flushingRef.current) return;
      flushingRef.current = true;
      try {
        const queued = await listQueuedHazardReports();
        if (queued.length === 0) return;
        const result = await flushQueuedReports(queued, (request) =>
          hazardsApi.reportHazard(accessToken, request),
        );
        for (const id of result.sent) {
          await removeQueuedHazardReport(id);
        }
      } finally {
        flushingRef.current = false;
      }
    }

    void flushNow();

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void flushNow();
    });

    return () => subscription.remove();
  }, [state]);
}
