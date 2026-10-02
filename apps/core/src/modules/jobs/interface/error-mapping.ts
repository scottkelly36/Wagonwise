import type {
  DriverBusy,
  DriverNotInCompany,
  Forbidden,
  JobNotFound,
  ProofOfDeliveryRequired,
  VehicleNotInCompany,
} from '../application/errors.js';
import type { InvalidReference, InvalidStops, InvalidTransition } from '../domain/job.js';

export type JobsError =
  | InvalidReference
  | InvalidStops
  | InvalidTransition
  | Forbidden
  | JobNotFound
  | DriverNotInCompany
  | VehicleNotInCompany
  | DriverBusy
  | ProofOfDeliveryRequired;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring every other module's
 *  error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: JobsError): number {
  switch (error.tag) {
    case 'InvalidReference':
    case 'InvalidStops':
    case 'DriverNotInCompany':
    case 'VehicleNotInCompany':
      return 400;
    case 'Forbidden':
      return 403;
    case 'JobNotFound':
      return 404;
    case 'InvalidTransition':
    case 'DriverBusy':
    case 'ProofOfDeliveryRequired':
      return 409;
  }
}
