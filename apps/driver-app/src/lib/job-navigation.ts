import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';

import type { MapPoint } from '../components/route-map';
import { distanceMetres } from './geo-distance';

type Stop = JobDto['stops'][number];

export interface NavigationTarget {
  readonly kind: 'pickup' | 'delivery';
  readonly stop: Stop;
}

/**
 * Where the driver should be navigated to for a job at this status: the pickup until the load is
 * on, the delivery once it is. Nothing while they are at a stop, before they have accepted, or once
 * the job is over. `undefined` too for a job that has no such stop.
 */
export function navigationTarget(
  job: Pick<JobDto, 'status' | 'stops'>,
): NavigationTarget | undefined {
  let kind: 'pickup' | 'delivery';
  if (job.status === 'accepted') kind = 'pickup';
  else if (job.status === 'loaded' || job.status === 'en_route') kind = 'delivery';
  else return undefined;
  const stop = job.stops.find((s) => s.kind === kind);
  return stop === undefined ? undefined : { kind, stop };
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
 * `tripToTarget` is whether a trip to the next stop is already running.
 */
export function jobActions(
  status: JobStatus,
  tripToTarget: boolean,
  hasPickup = true,
): JobActions | undefined {
  switch (status) {
    case 'assigned':
      return { primary: { kind: 'advance', to: 'accepted', label: 'Accept job' } };
    case 'accepted':
      // No pickup: nowhere to drive to yet. The driver says when the load is on.
      if (!hasPickup) {
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
        secondary: { kind: 'advance', to: 'at_delivery', label: 'Arrived' },
      };
    case 'at_delivery':
      return { primary: { kind: 'advance', to: 'delivered', label: 'Delivered' } };
    default:
      return undefined;
  }
}

/** The step a driver confirms from the trip screen (the job bar): arriving at the stop being driven to. */
export function arrivalStep(
  status: JobStatus,
  hasPickup = true,
): { to: JobStatus; label: string } | undefined {
  if (status === 'accepted' && hasPickup) return { to: 'at_pickup', label: 'Arrived at pickup' };
  if (status === 'en_route') return { to: 'at_delivery', label: 'Arrived' };
  return undefined;
}

/**
 * Where the job is, in a few words for a card: the stop being driven to, or "At <stop>" once there.
 * Before the job starts it is the pickup, since that is where the day begins.
 */
export function jobSubtitle(job: Pick<JobDto, 'status' | 'stops'>): string | undefined {
  const named = (kind: 'pickup' | 'delivery'): string | undefined =>
    job.stops.find((s) => s.kind === kind)?.name;
  switch (job.status) {
    case 'at_pickup':
      return named('pickup') === undefined ? undefined : `At ${named('pickup')}`;
    case 'at_delivery':
      return named('delivery') === undefined ? undefined : `At ${named('delivery')}`;
    case 'loaded':
    case 'en_route':
      return named('delivery');
    default:
      // Before the job starts it is the pickup, or the delivery when there is no pickup.
      return named('pickup') ?? named('delivery');
  }
}
