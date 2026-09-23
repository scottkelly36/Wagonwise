import type { TaggedError } from '../../../shared/result.js';

/** Also returned when a profile exists but belongs to a different driver — see
 *  update-vehicle-profile.ts and delete-vehicle-profile.ts: a mismatched owner looks identical to
 *  a missing profile, rather than leaking whether the id exists for someone else. */
export type VehicleProfileNotFound = TaggedError<'VehicleProfileNotFound'>;

/** Also returned when a plan exists but belongs to a different driver — same
 *  no-leak-by-ownership reasoning as `VehicleProfileNotFound`. */
export type RoutePlanNotFound = TaggedError<'RoutePlanNotFound'>;

/** Also returned when a trip exists but belongs to a different driver. */
export type ActiveTripNotFound = TaggedError<'ActiveTripNotFound'>;

/** One active trip per driver at a time (start-trip.ts) — keeps M6's future alerting subscriber
 *  unambiguous about which trip a driver's position updates belong to. */
export type TripAlreadyActive = TaggedError<'TripAlreadyActive'>;
