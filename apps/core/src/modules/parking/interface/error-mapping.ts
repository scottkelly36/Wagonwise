import type { SafeParkingSpotNotFound } from '../application/delete-safe-parking-spot.js';
import type { Forbidden } from '../application/admin-parking.js';
import type { SuggestionNotFound, TooManySuggestions } from '../application/spot-suggestions.js';
import type { InvalidSuggestion } from '../domain/spot-suggestion.js';
import type { InvalidNote } from '../domain/safe-parking-spot.js';

export type ParkingError =
  | InvalidNote
  | InvalidSuggestion
  | SafeParkingSpotNotFound
  | SuggestionNotFound
  | TooManySuggestions
  | Forbidden;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring every other module's
 *  error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: ParkingError): number {
  switch (error.tag) {
    case 'InvalidNote':
    case 'InvalidSuggestion':
      return 400;
    case 'SafeParkingSpotNotFound':
    case 'SuggestionNotFound':
      return 404;
    case 'TooManySuggestions':
      return 429;
    case 'Forbidden':
      return 403;
  }
}
