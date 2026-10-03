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
  readonly hasProofOfDelivery: boolean;
}

export type InvalidReference = TaggedError<'InvalidReference'>;

export interface InvalidStops extends TaggedError<'InvalidStops'> {
  readonly reason: 'empty' | 'no_pickup' | 'no_delivery';
}

export function validateReference(raw: string): Result<string, InvalidReference> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err({ tag: 'InvalidReference' });
  }
  return ok(trimmed);
}

/** Design doc §5 step 1: "pickup and delivery stops" — at least one of each. Order (pickups
 *  before deliveries) is a dispatch-time concern, not validated here. */
export function validateStops(stops: readonly JobStop[]): Result<JobStop[], InvalidStops> {
  if (stops.length === 0) {
    return err({ tag: 'InvalidStops', reason: 'empty' });
  }
  if (!stops.some((s) => s.kind === 'pickup')) {
    return err({ tag: 'InvalidStops', reason: 'no_pickup' });
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

/** The one forward step from each status (`draft -> assigned` is `assignJobToDriver`'s, not this). */
const NEXT: Readonly<Partial<Record<JobStatus, JobStatus>>> = {
  assigned: 'accepted',
  accepted: 'at_pickup',
  at_pickup: 'loaded',
  loaded: 'en_route',
  en_route: 'at_delivery',
  at_delivery: 'delivered',
};

export interface InvalidTransition extends TaggedError<'InvalidTransition'> {
  readonly from: JobStatus;
  readonly to: JobStatus;
}

function moved(job: Job, to: JobStatus, at: Date, position?: GeoPoint): Job {
  return {
    ...job,
    status: to,
    timeline: [
      ...job.timeline,
      { status: to, at, ...(position === undefined ? {} : { position }) },
    ],
  };
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
  if (NEXT[job.status] !== to) {
    return err({ tag: 'InvalidTransition', from: job.status, to });
  }
  return ok(moved(job, to, at, position));
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
