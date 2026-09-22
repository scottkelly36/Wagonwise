import type { CreateVehicleProfileError } from '../application/create-vehicle-profile.js';
import type { UpdateVehicleProfileError } from '../application/update-vehicle-profile.js';
import type { VehicleProfileNotFound } from '../application/errors.js';

// DeleteVehicleProfileError and GetVehicleProfileError are both just VehicleProfileNotFound —
// listed once here rather than unioning the (identical) named aliases in, which
// @typescript-eslint/no-duplicate-type-constituents rejects.
export type RoutingError =
  CreateVehicleProfileError | UpdateVehicleProfileError | VehicleProfileNotFound;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring identity's
 *  error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: RoutingError): number {
  switch (error.tag) {
    case 'InvalidName':
    case 'InvalidDimensions':
      return 400;
    case 'VehicleProfileNotFound':
      return 404;
  }
}
