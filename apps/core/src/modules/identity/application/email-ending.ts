import { checkEmail } from '@wagonwise/contracts/email-check';

import { err, ok, type Result } from '../../../shared/result.js';
import type { InvalidIdentifier } from '../domain/identifier.js';

/**
 * Turns away an email that ends in something that does not exist (name@gmail.comg), when a code is about to be sent to it: it would
 * only bounce, and the driver would wait for a code that is not coming. The apps ask about likely slips before this; this is the one
 * that cannot be got round, so it is only for the endings that cannot work.
 */
export function deliverableEmail(email: string): Result<string, InvalidIdentifier> {
  return checkEmail(email).kind === 'impossible'
    ? err({ tag: 'InvalidIdentifier', reason: 'not_email_or_phone' })
    : ok(email);
}
