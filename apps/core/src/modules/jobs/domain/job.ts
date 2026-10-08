import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type JobId = Id<'JobId'>;

// jobs owns its own CompanyId/StaffId rather than importing fleet's or companies' (AGENTS.md
// rule 6/7 — a module is reachable only through its facade). Same brand names (decision 46), so a
// value either side produces is usable here via makeId(), with no import across the module
// boundary.
export type CompanyId = Id<'CompanyId'>;
export type StaffId = Id<'StaffId'>;
export type DriverId = Id<'DriverId'>;
export type VehicleId = Id<'FleetVehicleId'>;
export type RoutePlanId = Id<'RoutePlanId'>;

// jobs owns its own GeoPoint too, for the same reason — no cross-module import, even though the
// shape is the same as congestion's and hazards' own copies.
export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export type JobStopKind = 'pickup' | 'delivery';

export interface JobStop {
  readonly kind: JobStopKind;
  readonly name: string;
  readonly location: GeoPoint;
  readonly windowFrom?: Date | undefined;
  readonly windowTo?: Date | undefined;
  readonly notes?: string | undefined;
}

/** Design doc §3's `JobStatus` — status can only move forward through these (plus cancel/fail),
 *  never implemented here yet (that's the next slice, not this one). */
export type JobStatus =
  | 'draft'
  | 'assigned'
  | 'accepted'
  | 'at_pickup'
  | 'loaded'
  | 'en_route'
  | 'at_delivery'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export interface JobTimelineEntry {
  readonly status: JobStatus;
  readonly at: Date;
  readonly position?: GeoPoint | undefined;
  /** The stop the driver was heading for or at when the status changed (0-based). */
  readonly stopIndex?: number | undefined;
}

/** A dispatcher's job (design doc §3). `driverId`/`vehicleId`/`routePlanId` are set once dispatch
 *  (not built yet) assigns the job — every job starts `draft` with none of them.
 *  `requiresProofOfDelivery` is the dispatcher's own call at creation (P2-M5.5): most jobs don't
 *  need it, but some do, and that's company policy, not something the driver decides. `delivered`
 *  refuses to be reached without a photo when it's set (`application/change-job-status.ts`).
 *  `hasProofOfDelivery` is a read-only fact computed from `jobs.proof_of_delivery` — attaching a
 *  photo is always allowed, regardless of whether one's required. */
export interface Job {
  readonly id: JobId;
  readonly companyId: CompanyId;
  readonly reference: string;
  readonly stops: readonly JobStop[];
  readonly driverId?: DriverId | undefined;
  readonly vehicleId?: VehicleId | undefined;
  readonly routePlanId?: RoutePlanId | undefined;
  readonly status: JobStatus;
  readonly timeline: readonly JobTimelineEntry[];
  readonly plannedStart?: Date | undefined;
  readonly dueBy?: Date | undefined;
  readonly requiresProofOfDelivery: boolean;
  /** The stop the driver is heading for or at (0-based into `stops`). Completing a stop moves it on; it is
   *  `stops.length` once the job is delivered. */
  readonly currentStop: number;
  /** The delivery stops (by position) that have a proof photo. */
  readonly proofStops: readonly number[];
  /** Whether proof is attached for what the driver is delivering now (every delivery once the job is
   *  delivered). Kept in step by `moved` and by the repository; see `hasProof`. */
  readonly hasProofOfDelivery: boolean;
}

export type InvalidReference = TaggedError<'InvalidReference'>;

export interface InvalidStops extends TaggedError<'InvalidStops'> {
  readonly reason: 'empty' | 'no_delivery' | 'too_many';
}

export function validateReference(raw: string): Result<string, InvalidReference> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err({ tag: 'InvalidReference' });
  }
  return ok(trimmed);
}

/** The most stops a job may have. */
export const MAX_STOPS = 20;

/** A job needs a delivery. A pickup is optional (2026-10-08): some firms always load at the same place, so
 *  the driver does not need directing there, and just says when they are loaded. Order (pickups before
 *  deliveries) is a dispatch-time concern, not validated here. */
export function validateStops(stops: readonly JobStop[]): Result<JobStop[], InvalidStops> {
  if (stops.length === 0) {
    return err({ tag: 'InvalidStops', reason: 'empty' });
  }
  if (stops.length > MAX_STOPS) {
    return err({ tag: 'InvalidStops', reason: 'too_many' });
  }
  if (!stops.some((s) => s.kind === 'delivery')) {
    return err({ tag: 'InvalidStops', reason: 'no_delivery' });
  }
  return ok([...stops]);
}

/** The statuses a driver is "on" a job in. A driver can be on at most one at a time (design doc §3). */
export const ACTIVE_STATUSES: readonly JobStatus[] = [
  'assigned',
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
];

const TERMINAL_STATUSES: readonly JobStatus[] = ['delivered', 'cancelled', 'failed'];

export function isActive(status: JobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function hasPickup(job: Pick<Job, 'stops'>): boolean {
  return job.stops.some((s) => s.kind === 'pickup');
}

/**
 * The one status a job can move to next, or undefined once it is over (or still a draft). The statuses are
 * the same whatever the stops: the driver arrives at the current stop (`at_pickup` or `at_delivery`), finishes
 * it (`loaded`, which means the load is on board and they are ready to set off, or `delivered` after the last
 * stop), and sets off for the next (`en_route`). A job that starts with a delivery has nowhere to collect, so it
 * goes from `accepted` straight to `loaded`.
 */
export function nextStatus(
  job: Pick<Job, 'status' | 'stops' | 'currentStop'>,
): JobStatus | undefined {
  const stop = job.stops[job.currentStop];
  switch (job.status) {
    case 'assigned':
      return 'accepted';
    case 'accepted':
      return stop?.kind === 'delivery' ? 'loaded' : 'at_pickup';
    case 'at_pickup':
      return 'loaded';
    case 'loaded':
      return 'en_route';
    case 'en_route':
      return stop?.kind === 'delivery' ? 'at_delivery' : 'at_pickup';
    case 'at_delivery':
      return job.currentStop + 1 >= job.stops.length ? 'delivered' : 'loaded';
    case 'draft':
    case 'delivered':
    case 'cancelled':
    case 'failed':
      return undefined;
  }
}

/** The delivery stop a proof photo belongs to now: the next delivery from where the driver is, or the last one. */
export function proofStopFor(job: Pick<Job, 'stops' | 'currentStop'>): number | undefined {
  const deliveries = job.stops.flatMap((s, i) => (s.kind === 'delivery' ? [i] : []));
  return deliveries.find((i) => i >= job.currentStop) ?? deliveries.at(-1);
}

/** Whether proof is attached for what the driver is delivering now, or for every delivery once delivered. */
export function hasProof(
  job: Pick<Job, 'stops' | 'currentStop' | 'status' | 'proofStops'>,
): boolean {
  if (job.status === 'delivered') {
    const deliveries = job.stops.flatMap((s, i) => (s.kind === 'delivery' ? [i] : []));
    return deliveries.length > 0 && deliveries.every((i) => job.proofStops.includes(i));
  }
  const stop = proofStopFor(job);
  return stop !== undefined && job.proofStops.includes(stop);
}

export interface InvalidTransition extends TaggedError<'InvalidTransition'> {
  readonly from: JobStatus;
  readonly to: JobStatus;
}

function moved(
  job: Job,
  to: JobStatus,
  at: Date,
  position?: GeoPoint,
  stop?: { readonly index: number; readonly nextStop: number },
): Job {
  const next: Job = {
    ...job,
    status: to,
    currentStop: stop?.nextStop ?? job.currentStop,
    timeline: [
      ...job.timeline,
      {
        status: to,
        at,
        ...(position === undefined ? {} : { position }),
        ...(stop === undefined ? {} : { stopIndex: stop.index }),
      },
    ],
  };
  return { ...next, hasProofOfDelivery: hasProof(next) };
}

/** Dispatch: only a `draft` job can be assigned, and it goes straight to `assigned`. */
export function assignJobToDriver(
  job: Job,
  driverId: DriverId,
  vehicleId: VehicleId,
  at: Date,
): Result<Job, InvalidTransition> {
  if (job.status !== 'draft') {
    return err({ tag: 'InvalidTransition', from: job.status, to: 'assigned' });
  }
  return ok({ ...moved(job, 'assigned', at), driverId, vehicleId });
}

/** Status only moves forward, one step at a time; every change is timestamped, and stamped with
 *  a GPS position when there is one (design doc §3). Cancel and fail have their own functions. */
export function advanceStatus(
  job: Job,
  to: JobStatus,
  at: Date,
  position?: GeoPoint,
): Result<Job, InvalidTransition> {
  if (nextStatus(job) !== to) {
    return err({ tag: 'InvalidTransition', from: job.status, to });
  }
  // Finishing a stop (collected, delivered) moves on to the next one.
  const finishesStop = job.status === 'at_pickup' || job.status === 'at_delivery';
  return ok(
    moved(job, to, at, position, {
      index: job.currentStop,
      nextStop: finishesStop ? job.currentStop + 1 : job.currentStop,
    }),
  );
}

/** Any job that isn't finished can be cancelled. */
export function cancelJob(job: Job, at: Date): Result<Job, InvalidTransition> {
  if (TERMINAL_STATUSES.includes(job.status)) {
    return err({ tag: 'InvalidTransition', from: job.status, to: 'cancelled' });
  }
  return ok(moved(job, 'cancelled', at));
}

/** A job can only fail once it's with a driver. */
export function failJob(job: Job, at: Date, position?: GeoPoint): Result<Job, InvalidTransition> {
  if (!isActive(job.status)) {
    return err({ tag: 'InvalidTransition', from: job.status, to: 'failed' });
  }
  return ok(moved(job, 'failed', at, position));
}

/** The statuses in which the driver is actually out doing the job, so the app reports position
 *  and the dispatcher's live map shows it (P2-M6). Not `assigned` — the driver hasn't taken the job
 *  yet, so there's no reason to know where they are. */
export const TRACKED_STATUSES: readonly JobStatus[] = [
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
];

export function isTracked(status: JobStatus): boolean {
  return TRACKED_STATUSES.includes(status);
}

/** The stop a driver on this job is heading for or at (P2-M6.4's ETA, and the dashboard's "heading for").
 *  Undefined once there are none left, and for an accepted job that starts with a delivery: there is nowhere to
 *  go until they say they are loaded. */
export function nextStopFor(
  job: Pick<Job, 'status' | 'stops' | 'currentStop'>,
): JobStop | undefined {
  const stop = job.stops[job.currentStop];
  if (stop === undefined) return undefined;
  if (job.status === 'accepted' && stop.kind === 'delivery') return undefined;
  return stop;
}
