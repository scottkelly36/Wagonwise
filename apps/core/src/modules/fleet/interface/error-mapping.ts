import type {
  AlreadyInvited,
  AlreadyLinked,
  CapacityReached,
  FleetVehicleNotFound,
  Forbidden,
  RegistrationTaken,
  InvalidCode,
  LinkNotFound,
  TooManyAttempts,
} from '../application/errors.js';
import type { InvalidIdentifier, InvalidLinkTransition } from '../domain/driver-link.js';
import type { InvalidDimensions, InvalidName, InvalidRegistration } from '../domain/vehicle.js';

export type FleetError =
  | InvalidName
  | InvalidDimensions
  | FleetVehicleNotFound
  | CapacityReached
  | InvalidRegistration
  | RegistrationTaken
  | Forbidden
  | InvalidIdentifier
  | InvalidCode
  | LinkNotFound
  | AlreadyLinked
  | AlreadyInvited
  | InvalidLinkTransition
  | TooManyAttempts;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring every other module's
 *  error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: FleetError): number {
  switch (error.tag) {
    case 'InvalidName':
    case 'InvalidDimensions':
    case 'InvalidRegistration':
    case 'InvalidIdentifier':
    case 'InvalidCode':
      return 400;
    case 'FleetVehicleNotFound':
    case 'LinkNotFound':
      return 404;
    case 'Forbidden':
      return 403;
    case 'AlreadyLinked':
    case 'CapacityReached':
    case 'RegistrationTaken':
    case 'AlreadyInvited':
    case 'InvalidLinkTransition':
      return 409;
    case 'TooManyAttempts':
      return 429;
  }
}
