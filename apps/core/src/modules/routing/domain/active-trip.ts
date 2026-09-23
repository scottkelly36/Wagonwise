import type { Id } from '../../../shared/brand.js';
import type { GeoPoint } from './geo.js';
import type { RoutePlanId } from './route-plan.js';
import type { DriverId } from './vehicle-profile.js';

export type ActiveTripId = Id<'ActiveTripId'>;

/**
 * A trip in progress (design doc §3). `driverId` is duplicated from the `RoutePlan` it started
 * from — same reasoning `RoutePlan` itself uses for duplicating `driverId` off `VehicleProfile`
 * (decision 49, docs/progress.md): a direct ownership check with no join. `lastPosition` stays
 * unset for the whole of M5.6 — writing it for real needs a position-update endpoint that only
 * M6's reroute alerts actually need (design doc §6), so it isn't built until that has a real
 * caller (same "don't wire an unused dependency" precedent as M2.3's `RoutingEngine`).
 */
export interface ActiveTrip {
  readonly id: ActiveTripId;
  readonly routePlanId: RoutePlanId;
  readonly driverId: DriverId;
  readonly startedAt: Date;
  readonly lastPosition?: GeoPoint | undefined;
  readonly endedAt?: Date | undefined;
}
