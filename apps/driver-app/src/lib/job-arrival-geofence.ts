import type { JobStatus, JobStopDto } from '@wagonwise/contracts/jobs';

import type { MapPoint } from '../components/route-map';
import { distanceMetres } from './geo-distance';
import { NEXT_STEP } from './job-status';

// A placeholder, not a tuned value — worth revisiting once there's real field data on GPS drift
// and how close a stop's pin actually sits to where a driver parks (not a safety-critical value
// either way: this only ever prompts a confirm, design doc §5, never changes anything by itself).
const ARRIVAL_RADIUS_M = 200;

/** Which stop kind counts as "arrival" for the status a job is currently in — only the two
 *  location-triggered steps design doc §5 names ("geofences around stops prompt 'Arrived at
 *  pickup?'"). Every other step (accept, loaded, set off, delivered) is tap (M5.2) or voice
 *  (M5.3) only — nothing about them is tied to a specific point on the map. */
const ARRIVAL_STOP_KIND: Partial<Record<JobStatus, JobStopDto['kind']>> = {
  accepted: 'pickup',
  en_route: 'delivery',
};

export interface ArrivalNudge {
  readonly to: JobStatus;
  readonly promptTitle: string;
}

/**
 * Whether a job at `position` is close enough to its next stop to prompt an arrival confirm, or
 * `undefined` when there's nothing to check — no job, no position, a status with no
 * location-triggered step, or just not close enough yet. Pure, so the geofence decision itself is
 * unit-testable without a live location watch; `use-job-arrival-geofence.ts` is what actually
 * shows the prompt and reacts to the driver's answer.
 */
export function arrivalNudgeFor(
  job:
    | { readonly id: string; readonly status: JobStatus; readonly stops: readonly JobStopDto[] }
    | undefined,
  position: MapPoint | undefined,
): ArrivalNudge | undefined {
  if (job === undefined || position === undefined) return undefined;
  const kind = ARRIVAL_STOP_KIND[job.status];
  if (kind === undefined) return undefined;
  const nextStep = NEXT_STEP[job.status];
  if (nextStep === undefined) return undefined;

  const nearby = job.stops.some(
    (stop) => stop.kind === kind && distanceMetres(position, stop.location) <= ARRIVAL_RADIUS_M,
  );
  if (!nearby) return undefined;

  return { to: nextStep.to, promptTitle: `${nextStep.label}?` };
}
