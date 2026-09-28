import type { InvalidDimensions, InvalidName } from '../domain/vehicle.js';
import type { FleetVehicleNotFound, Forbidden } from '../application/errors.js';

export type FleetError = InvalidName | InvalidDimensions | FleetVehicleNotFound | Forbidden;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring every other module's
 *  error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: FleetError): number {
  switch (error.tag) {
    case 'InvalidName':
    case 'InvalidDimensions':
      return 400;
    case 'FleetVehicleNotFound':
      return 404;
    case 'Forbidden':
      return 403;
  }
}
