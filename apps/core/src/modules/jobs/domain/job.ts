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
 *  (not built yet) assigns the job — every job starts `draft` with none of them. */
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
