import type { InvalidReference, InvalidStops } from '../domain/job.js';
import type { Forbidden } from '../application/errors.js';

export type JobsError = InvalidReference | InvalidStops | Forbidden;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring every other module's
 *  error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: JobsError): number {
  switch (error.tag) {
    case 'InvalidReference':
    case 'InvalidStops':
      return 400;
    case 'Forbidden':
      return 403;
  }
}
