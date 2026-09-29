import { err, ok, type Result } from '../../../shared/result.js';
import {
  consumeChallenge,
  isChallengeUsable,
  recordFailedAttempt,
  type StaffChallengeId,
  type ChallengeNotUsable,
} from '../domain/staff-challenge.js';
import { audit, auditCompanyOf } from './audit.js';
import { checkSecondFactorCode, totpCiphertextOf } from './check-second-factor-code.js';
import type { InvalidCode } from './confirm-staff-enrolment.js';
import type { TooManyAttempts } from './staff-sign-in.js';
import { sha256Hex } from './hash.js';
import { issueStaffSession, type StaffTokens } from './issue-staff-session.js';
import { isAccountLockedOut } from './lockout.js';
import { normaliseRecoveryCode } from './recovery-code.js';
import type { StaffDeps } from './staff-deps.js';

/**
 * Step 2 of signing in: the 6-digit code, or one of the account's recovery codes if the phone is
 * lost. 5 wrong tries end the challenge; the person starts again from their password.
 */
export async function verifyStaffSecondFactor(
  deps: Pick<
    StaffDeps,
    | 'accounts'
    | 'challenges'
    | 'recoveryCodes'
    | 'sessions'
    | 'auditLog'
    | 'secretBox'
    | 'totp'
    | 'randomCodes'
    | 'tokenIssuer'
    | 'clock'
    | 'ids'
  >,
  input: { readonly challengeId: StaffChallengeId; readonly code: string },
): Promise<Result<StaffTokens, ChallengeNotUsable | InvalidCode | TooManyAttempts>> {
  const now = deps.clock.now();
  const challenge = await deps.challenges.findById(input.challengeId);
  if (!challenge || challenge.purpose !== 'sign-in' || !isChallengeUsable(challenge, now)) {
    return err({ tag: 'ChallengeNotUsable' });
  }
  const account = await deps.accounts.findById(challenge.staffId);
  const credentials = account ? await deps.accounts.findCredentials(account.id) : null;
  if (!account || !credentials) return err({ tag: 'ChallengeNotUsable' });
  if (await isAccountLockedOut(deps, account.id)) return err({ tag: 'TooManyAttempts' });

  const code = input.code.trim();
  const byRecoveryCode = !/^\d{6}$/.test(code);
  let passed = false;
  if (!byRecoveryCode) {
    passed = checkSecondFactorCode(
      deps,
      challenge,
      totpCiphertextOf(credentials.secondFactor),
      code,
    );
  } else {
    const recovery = normaliseRecoveryCode(code);
    passed =
      recovery !== null && (await deps.recoveryCodes.use(account.id, sha256Hex(recovery), now));
  }

  const about = { companyId: auditCompanyOf(account), targetId: account.id };
  if (!passed) {
    await deps.challenges.save(recordFailedAttempt(challenge));
    await audit(deps, { action: 'second_factor_failed', ...about });
    return err({ tag: 'InvalidCode' });
  }
  await deps.challenges.save(consumeChallenge(challenge, now));
  await audit(deps, {
    action: 'signed_in',
    actorId: account.id,
    ...about,
    details: { method: byRecoveryCode ? 'recovery_code' : challenge.method },
  });
  return ok(await issueStaffSession(deps, account));
}
