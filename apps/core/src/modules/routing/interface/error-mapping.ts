import type { CreateVehicleProfileError } from '../application/create-vehicle-profile.js';
import type { UpdateVehicleProfileError } from '../application/update-vehicle-profile.js';
import type {
  ActiveTripNotFound,
  RoutePlanNotFound,
  TripAlreadyActive,
  VehicleProfileNotFound,
} from '../application/errors.js';
import type { NoRouteFound } from '../application/ports/routing-engine.js';

// DeleteVehicleProfileError, GetVehicleProfileError and PlanRouteError's VehicleProfileNotFound
// case are all just VehicleProfileNotFound — listed once here rather than unioning the
// (identical) named aliases in, which @typescript-eslint/no-duplicate-type-constituents rejects.
export type RoutingError =
  | CreateVehicleProfileError
  | UpdateVehicleProfileError
  | VehicleProfileNotFound
  | NoRouteFound
  | RoutePlanNotFound
  | TripAlreadyActive
  | ActiveTripNotFound;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring identity's
 *  error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: RoutingError): number {
  switch (error.tag) {
    case 'InvalidName':
    case 'InvalidDimensions':
    case 'InvalidFuelConsumption':
      return 400;
    case 'VehicleProfileNotFound':
    case 'RoutePlanNotFound':
    case 'ActiveTripNotFound':
      return 404;
    // The request was well-formed and the profile is real, but the vehicle genuinely cannot get
    // there — not a missing resource (404) or a client-input error (400), so 422 Unprocessable
    // Entity: the server understood the request and can't fulfil it for a real-world reason.
    case 'NoRouteFound':
      return 422;
    // A second start-trip request while one is already active conflicts with existing state
    // rather than being malformed or missing anything.
    case 'TripAlreadyActive':
      return 409;
  }
}
