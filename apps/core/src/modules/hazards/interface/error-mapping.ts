import type { InvalidMeasurement } from '../domain/hazard-report.js';
import type { Forbidden } from '../application/authorization.js';
import type { HazardReportNotFound } from '../application/errors.js';

export type HazardsError = InvalidMeasurement | HazardReportNotFound | Forbidden;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring identity's and
 *  routing's error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: HazardsError): number {
  switch (error.tag) {
    case 'InvalidMeasurement':
      return 400;
    case 'HazardReportNotFound':
      return 404;
    case 'Forbidden':
      return 403;
  }
}
