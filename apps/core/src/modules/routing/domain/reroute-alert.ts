import type { Id } from '../../../shared/brand.js';
import type { ActiveTripId } from './active-trip.js';
import type { RoutePlanId } from './route-plan.js';
import type { DriverId } from './vehicle-profile.js';

export type RerouteAlertId = Id<'RerouteAlertId'>;

export type RerouteSubjectType = 'active_trip' | 'route_plan';

/**
 * A record that a driver was (or would be) notified about a hazard on their route (design doc
 * §6). Exists purely for the two guardrails the design doc names: "one alert per hazard per
 * trip" (the `(hazardId, subjectType, subjectId)` uniqueness the repository enforces) and "a cap
 * per trip per hour" (`countSince`). `subjectId` is an `ActiveTripId` or a `RoutePlanId`
 * depending on `subjectType` — left untyped as a plain branded string rather than a union of the
 * two, since nothing here needs to narrow on it beyond passing it back to the repository.
 */
export interface RerouteAlert {
  readonly id: RerouteAlertId;
  readonly hazardId: string;
  readonly subjectType: RerouteSubjectType;
  readonly subjectId: ActiveTripId | RoutePlanId;
  readonly driverId: DriverId;
  readonly newRoutePlanId: RoutePlanId;
  readonly sentAt: Date;
}
