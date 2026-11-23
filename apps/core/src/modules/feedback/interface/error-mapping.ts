import type { FeedbackNotFound, Forbidden } from '../application/review-feedback.js';
import type { NotAvailable, WordingChanged } from '../application/research-contact.js';
import type { InvalidMessage } from '../domain/feedback-note.js';

export type FeedbackError =
  InvalidMessage | Forbidden | FeedbackNotFound | NotAvailable | WordingChanged;

/** Tag -> HTTP status, in exactly one table (AGENTS.md rule 13), mirroring every other module's
 *  error-mapping.ts. `switch-exhaustiveness-check` means a new domain error tag breaks
 *  compilation here instead of silently becoming a 500. */
export function statusFor(error: FeedbackError): number {
  switch (error.tag) {
    case 'InvalidMessage':
      return 400;
    case 'Forbidden':
      return 403;
    case 'FeedbackNotFound':
      return 404;
    case 'NotAvailable':
    case 'WordingChanged':
      return 409;
  }
}
