import type { JobStatus, JobStopDto } from '@wagonwise/contracts/jobs';

import type { MapPoint } from '../components/route-map';
import { distanceMetres } from './geo-distance';
import { nextStepFor } from './job-status';

// A placeholder, not a tuned value — worth revisiting once there's real field data on GPS drift
// and how close a stop's pin actually sits to where a driver parks (not a safety-critical value
// either way: this only ever prompts a confirm, design doc §5, never changes anything by itself).
const ARRIVAL_RADIUS_M = 200;

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
    | {
        readonly id: string;
        readonly status: JobStatus;
        readonly stops: readonly JobStopDto[];
        readonly currentStop: number;
      }
    | undefined,
  position: MapPoint | undefined,
): ArrivalNudge | undefined {
  if (job === undefined || position === undefined) return undefined;
  // Only the two arrival steps are tied to a place: heading for a collection (accepted, or en route to a
  // later one) or for a delivery (en route). Accepted with a delivery first means nothing to arrive at yet.
  if (job.status !== 'accepted' && job.status !== 'en_route') return undefined;
  const stop = job.stops[job.currentStop];
  if (stop === undefined) return undefined;
  if (job.status === 'accepted' && stop.kind !== 'pickup') return undefined;
  const nextStep = nextStepFor(job);
  if (nextStep === undefined) return undefined;
  if (distanceMetres(position, stop.location) > ARRIVAL_RADIUS_M) return undefined;
  return { to: nextStep.to, promptTitle: `${nextStep.label}?` };
}
