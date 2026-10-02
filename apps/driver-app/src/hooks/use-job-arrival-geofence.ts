import type { JobDto } from '@wagonwise/contracts/jobs';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { useAdvanceJobStatus } from '../api/use-jobs';
import type { MapPoint } from '../components/route-map';
import { arrivalNudgeFor } from '../lib/job-arrival-geofence';

/**
 * Automatic nudges, never automatic changes (M5.4, design doc §5): once the driver's live
 * position is close enough to the job's next stop, prompt "Arrived at pickup?" — the driver still
 * has to confirm; nothing advances on its own. A native `Alert` rather than anything screen-bound,
 * so it reaches the driver wherever they are in the app. Foreground-only, checked against
 * whatever position the caller already has from `useLiveLocation` — not `expo-location`'s
 * background geofencing API, so no extra permission to ask for (consistent with design doc §9's
 * privacy stance: only ever using location the app is already tracking for something else).
 * Mounted on `/home`, the screen a driver is actually looking at while driving ("map is the app")
 * — `/job` itself doesn't run this check.
 *
 * Prompts at most once per job per status: declining ("Not yet") or dismissing doesn't ask again
 * for the same arrival — the tap (M5.2) and voice (M5.3) buttons are always there as a fallback.
 * Worth revisiting with field feedback if drivers want a second chance after moving away and
 * back, but that's more state than this first slice needs.
 */
export function useJobArrivalGeofence(
  job: JobDto | null | undefined,
  position: MapPoint | undefined,
): void {
  const advance = useAdvanceJobStatus();
  const nudgedForRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!job) return;
    const key = `${job.id}:${job.status}`;
    if (nudgedForRef.current === key) return;

    const nudge = arrivalNudgeFor(job, position);
    if (!nudge) return;

    nudgedForRef.current = key;
    Alert.alert(nudge.promptTitle, undefined, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Yes', onPress: () => advance.mutate({ jobId: job.id, status: nudge.to }) },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, position]);
}
