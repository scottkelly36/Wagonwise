import { isDisposableEmail } from '@wagonwise/contracts/disposable-email';
import { err, ok, type Result } from '../../../shared/result.js';
import type { DisposableEmail, SignUpsPaused, UkMobileRequired } from './errors.js';
import type { DriverRepository } from './ports/driver-repository.js';

/** A UK mobile as the account is stored: +44 7…, ten digits after the 7. The personal-number range (070) is left out: it is charged at a premium. */
const UK_MOBILE = /^\+447[1-9]\d{8}$/;

/** The first moment of the current UTC day. */
const startOfDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export interface NewAccountLimits {
  /** New driver accounts a UTC day, across everyone; 0 or unset means no limit. A guard against a bot, not a limit a real launch meets. */
  readonly newDriversPerDay?: number | undefined;
  /** Told when the day's limit is what turned someone away, so the owner hears of a surge (or a bot) and it is not silent. */
  readonly onSignUpsPaused?: (() => void) | undefined;
}

/** Whether today's limit on new accounts has been reached. Counted from the drivers table, so a restart does not reset it. */
export async function signUpsPaused(
  deps: { readonly driverRepo: Pick<DriverRepository, 'countCreatedSince'> } & NewAccountLimits,
  now: Date,
): Promise<Result<void, SignUpsPaused>> {
  const cap = deps.newDriversPerDay ?? 0;
  if (cap <= 0) return ok(undefined);
  if ((await deps.driverRepo.countCreatedSince(startOfDay(now))) < cap) return ok(undefined);
  deps.onSignUpsPaused?.();
  return err({ tag: 'SignUpsPaused' });
}

/**
 * What a brand-new account must look like, checked only when there is no account yet (a driver who already has one is never asked): an
 * email not at a throwaway provider, and a number that is a UK mobile. `identifier` is in its stored form (+44…).
 */
export function acceptableNewIdentifier(
  identifier: string,
): Result<void, DisposableEmail | UkMobileRequired> {
  if (identifier.includes('@')) {
    return isDisposableEmail(identifier) ? err({ tag: 'DisposableEmail' }) : ok(undefined);
  }
  return UK_MOBILE.test(identifier) ? ok(undefined) : err({ tag: 'UkMobileRequired' });
}
