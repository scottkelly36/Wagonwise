import type { InvalidEstimatedWait } from '../domain/congestion-report.js';

export type CongestionError = InvalidEstimatedWait;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring hazards', identity's and
 *  routing's error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: CongestionError): number {
  switch (error.tag) {
    case 'InvalidEstimatedWait':
      return 400;
  }
}
