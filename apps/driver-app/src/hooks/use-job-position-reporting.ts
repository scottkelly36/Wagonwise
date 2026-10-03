import type { JobDto } from '@wagonwise/contracts/jobs';
import { useEffect, useRef } from 'react';

import * as jobsApi from '../api/jobs';
import type { MapPoint } from '../components/route-map';
import { isTrackedStatus, POSITION_REPORT_INTERVAL_MS } from '../lib/job-position-reporting';
import { useAccessToken } from './use-access-token';

/**
 * Tells the company where the driver is while they're out on a job, so the dispatcher's live map
 * works (P2-M6.1, design doc §6). Reuses the position `useLiveLocation` is already watching — no
 * second location watch and no extra permission, the same stance as the arrival geofence. Only
 * while the job is being driven (`isTrackedStatus`) and only while the app is open: nothing is
 * collected in the background, so the map shows "last seen" when a phone is locked or the app is
 * closed.
 *
 * On a timer rather than on every position update: a parked driver's position stops changing (the
 * watch only fires after moving 10 m), but the office still wants to know they're there. A failed
 * report is simply skipped — a late position is worthless, so there is no queue to retry from.
 */
export function useJobPositionReporting(
  job: JobDto | null | undefined,
  position: MapPoint | undefined,
): void {
  const accessToken = useAccessToken();
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const jobId =
    job !== null && job !== undefined && isTrackedStatus(job.status) ? job.id : undefined;
  const hasPosition = position !== undefined;

  useEffect(() => {
    if (jobId === undefined || !hasPosition) return;

    function report(): void {
      const point = positionRef.current;
      if (point === undefined || jobId === undefined) return;
      void jobsApi.reportJobPosition(accessToken, jobId, point).catch(() => undefined);
    }

    report();
    const timer = setInterval(report, POSITION_REPORT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accessToken, jobId, hasPosition]);
}
