import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';

import type { MapPoint } from '../components/route-map';
import { distanceMetres } from './geo-distance';

type Stop = JobDto['stops'][number];

export interface NavigationTarget {
  readonly kind: 'pickup' | 'delivery';
  readonly stop: Stop;
}

/**
 * Where the driver should be navigated to for a job at this status: the stop they are heading for. Nothing while
 * they are at a stop, before they have accepted, or once the job is over; and nothing for an accepted job that
 * starts with a delivery, since there is nothing to collect and they are not on their way until they say they
 * are loaded. `undefined` too once there is no stop left.
 */
export function navigationTarget(
  job: Pick<JobDto, 'status' | 'stops' | 'currentStop'>,
): NavigationTarget | undefined {
  const stop = job.stops[job.currentStop];
  if (stop === undefined) return undefined;
  if (job.status === 'accepted')
    return stop.kind === 'pickup' ? { kind: 'pickup', stop } : undefined;
  if (job.status === 'loaded' || job.status === 'en_route') return { kind: stop.kind, stop };
  return undefined;
}

/** A trip already running whose destination is this stop (to within a few hundred metres, since the
 *  route ends on the nearest road, not on the stop's own point): offered as "Continue", not restarted. */
const SAME_DESTINATION_M = 300;

export function isTripToTarget(planDestination: MapPoint, target: NavigationTarget): boolean {
  return distanceMetres(planDestination, target.stop.location) <= SAME_DESTINATION_M;
}

export type JobAction =
  | { readonly kind: 'advance'; readonly to: JobStatus; readonly label: string }
  | {
      readonly kind: 'navigate';
      readonly label: string;
      /** Move the job to this status before navigating ("Set off"). */
      readonly advanceFirst?: JobStatus;
    };

export interface JobActions {
  readonly primary: JobAction;
  /** The manual step for a driver who is already there (or did not use the navigation). */
  readonly secondary?: JobAction;
}

/**
 * The buttons on the job screen. Accept, then Start (which plans the route for the assigned vehicle
 * and opens navigation), then the manual arrival steps. Nothing here starts on its own: every
 * navigation begins with the driver's tap, so no route is ever switched silently.
 * `tripToTarget` is whether a trip to the next stop is already running. With several stops the same steps repeat
 * for each: arrive, finish it (loaded, or delivered), set off for the next.
 */
export function jobActions(
  job: Pick<JobDto, 'status' | 'stops' | 'currentStop'>,
  tripToTarget: boolean,
): JobActions | undefined {
  const kind = job.stops[job.currentStop]?.kind;
  switch (job.status) {
    case 'assigned':
      return { primary: { kind: 'advance', to: 'accepted', label: 'Accept job' } };
    case 'accepted':
      // Starts with a delivery: nowhere to drive to yet. The driver says when the load is on.
      if (kind === 'delivery') {
        return { primary: { kind: 'advance', to: 'loaded', label: 'Loaded and ready' } };
      }
      return {
        primary: { kind: 'navigate', label: tripToTarget ? 'Continue navigation' : 'Start' },
        secondary: { kind: 'advance', to: 'at_pickup', label: 'Arrived at pickup' },
      };
    case 'at_pickup':
      return { primary: { kind: 'advance', to: 'loaded', label: 'Loaded' } };
    case 'loaded':
      return {
        primary: { kind: 'navigate', label: 'Set off', advanceFirst: 'en_route' },
      };
    case 'en_route':
      return {
        primary: {
          kind: 'navigate',
          label: tripToTarget ? 'Continue navigation' : 'Start navigation',
        },
        secondary:
          kind === 'pickup'
            ? { kind: 'advance', to: 'at_pickup', label: 'Arrived at pickup' }
            : { kind: 'advance', to: 'at_delivery', label: 'Arrived' },
      };
    case 'at_delivery':
      return {
        primary: {
          kind: 'advance',
          to: job.currentStop >= job.stops.length - 1 ? 'delivered' : 'loaded',
          label: 'Delivered',
        },
      };
    case 'draft':
    case 'delivered':
    case 'cancelled':
    case 'failed':
      return undefined;
  }
}

/** The step a driver confirms from the trip screen (the job bar): arriving at the stop being driven to. */
export function arrivalStep(
  job: Pick<JobDto, 'status' | 'stops' | 'currentStop'>,
): { to: JobStatus; label: string } | undefined {
  const kind = job.stops[job.currentStop]?.kind;
  if (job.status === 'accepted' && kind === 'pickup') {
    return { to: 'at_pickup', label: 'Arrived at pickup' };
  }
  if (job.status === 'en_route') {
    return kind === 'pickup'
      ? { to: 'at_pickup', label: 'Arrived at pickup' }
      : { to: 'at_delivery', label: 'Arrived' };
  }
  return undefined;
}

/**
 * Where the job is, in a few words for a card: the stop being driven to, or "At <stop>" once there. Before the
 * job starts it is the first stop, since that is where the day begins. A job with several stops adds which one.
 */
export function jobSubtitle(
  job: Pick<JobDto, 'status' | 'stops' | 'currentStop'>,
): string | undefined {
  const stop = job.stops[job.currentStop];
  if (stop === undefined) return undefined;
  const where =
    job.status === 'at_pickup' || job.status === 'at_delivery' ? `At ${stop.name}` : stop.name;
  const inProgress =
    job.status !== 'delivered' && job.status !== 'cancelled' && job.status !== 'failed';
  return job.stops.length > 2 && inProgress
    ? `${where} · ${job.currentStop + 1} of ${job.stops.length}`
    : where;
}
