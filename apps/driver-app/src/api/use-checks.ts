import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { listQueuedCheckSummaries, readChecksDue, saveChecksDue } from '../db/check-queue';
import { CHECKS_DUE_KEY, PENDING_CHECKS_KEY } from '../hooks/use-check-queue-flush';
import { useAccessToken } from '../hooks/use-access-token';
import { mergeDue, type DueView } from '../lib/check-due';
import * as checksApi from './checks';

/** How often a screen showing the checks asks again. A job assigned while the app is open brings its vehicle's
 *  lists with it, and a colleague may do a check on the same vehicle. */
const CHECKS_POLL_MS = 60_000;

/**
 * The check lists for the vehicle on the driver's current job, each marked due, waiting to send, or done.
 *
 * The last answer is kept on the phone, so a driver who is offline at the vehicle can still start the check: the
 * lists were fetched earlier, when there was signal. With no signal and nothing kept there is simply nothing to
 * show, and the Jobs tab carries on as it did.
 */
export function useChecksDue(): {
  readonly view: DueView | undefined;
  readonly isPending: boolean;
  readonly refetch: () => void;
} {
  const accessToken = useAccessToken();
  const due = useQuery({
    queryKey: CHECKS_DUE_KEY,
    queryFn: async () => {
      try {
        const fresh = await checksApi.getChecksDue(accessToken);
        await saveChecksDue(fresh);
        return fresh;
      } catch (error) {
        const kept = await readChecksDue();
        if (kept === undefined) throw error;
        return kept;
      }
    },
    refetchInterval: CHECKS_POLL_MS,
    retry: false,
  });
  const queued = useQuery({
    queryKey: PENDING_CHECKS_KEY,
    queryFn: listQueuedCheckSummaries,
  });

  const view = useMemo(
    () => (due.data === undefined ? undefined : mergeDue(due.data, queued.data ?? [])),
    [due.data, queued.data],
  );
  return {
    view,
    isPending: due.isPending,
    refetch: () => void due.refetch(),
  };
}
