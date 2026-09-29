import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { SecondFactorMethod } from '../domain/staff-account.js';
import {
  STAFF_CHALLENGE_LIFETIME_MS,
  type SignInChallenge,
  type StaffChallengeId,
} from '../domain/staff-challenge.js';
import type { CodeNotSent } from './accept-staff-invite.js';
import { audit, auditCompanyOf } from './audit.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

/** Wrong email or wrong password: one error, so the response never reveals which accounts exist. */
export type InvalidCredentials = TaggedError<'InvalidCredentials'>;

export interface StaffSignInChallenge {
  readonly challengeId: StaffChallengeId;
  readonly method: SecondFactorMethod;
  readonly expiresAt: Date;
}

// A valid scrypt hash of a random password nobody knows. Checked against when the email doesn't
// match an account, so a wrong email takes as long as a wrong password.
export const TIMING_DECOY_HASH =
  'scrypt$32768$8$1$m0TAaeC8QwOWfjrR7yYOAw==$3gKOuoWXwXQubsB5y6HMWCAuBmmZybcF+62KpQLvqsK6YRNv+aEw8tPKRrUrRVWLYLdXE7V37xz6e2olxHQnEA==';

/**
 * Step 1 of signing in. A correct password never signs anyone in on its own: it opens a
 * second-factor challenge, and for text/email a code is sent now.
 */
export async function staffSignIn(
  deps: Pick<
    StaffDeps,
    | 'accounts'
    | 'challenges'
    | 'auditLog'
    | 'passwordHasher'
    | 'codeSender'
    | 'randomCodes'
    | 'clock'
    | 'ids'
  >,
  input: { readonly email: string; readonly password: string },
): Promise<Result<StaffSignInChallenge, InvalidCredentials | CodeNotSent>> {
  const account = await deps.accounts.findByEmail(input.email);
  const credentials = account ? await deps.accounts.findCredentials(account.id) : null;
  const passwordOk = await deps.passwordHasher.verify(
    input.password,
    credentials?.passwordHash ?? TIMING_DECOY_HASH,
  );
  if (!account || !credentials || !passwordOk) {
    // Only a known account's failures are recorded: an unknown email has no company to file
    // it under, and the response is the same either way.
    if (account) {
      await audit(deps, {
        action: 'sign_in_failed',
        companyId: auditCompanyOf(account),
        targetId: account.id,
      });
    }
    return err({ tag: 'InvalidCredentials' });
  }

  const now = deps.clock.now();
  const factor = credentials.secondFactor;
  const code = factor.method === 'totp' ? null : deps.randomCodes.sixDigitCode();
  const challenge: SignInChallenge = {
    id: makeId<'StaffChallengeId'>(deps.ids.newId()),
    purpose: 'sign-in',
    staffId: account.id,
    method: factor.method,
    codeHash: code === null ? null : sha256Hex(code),
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + STAFF_CHALLENGE_LIFETIME_MS),
    consumedAt: null,
  };
  await deps.challenges.save(challenge);

  if (code !== null) {
    const destination = factor.method === 'sms' ? factor.phone : account.email;
    try {
      await deps.codeSender.send(destination, code);
    } catch {
      return err({ tag: 'CodeNotSent' });
    }
  }
  return ok({ challengeId: challenge.id, method: factor.method, expiresAt: challenge.expiresAt });
}
