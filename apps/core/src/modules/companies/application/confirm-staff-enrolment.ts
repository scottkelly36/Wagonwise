import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { StaffAccount } from '../domain/staff-account.js';
import {
  consumeChallenge,
  isChallengeUsable,
  recordFailedAttempt,
  type StaffChallengeId,
} from '../domain/staff-challenge.js';
import type { SecondFactor } from '../domain/staff-credentials.js';
import { isInviteOpen } from '../domain/staff-invite.js';
import type { InviteNotUsable } from './accept-staff-invite.js';
import { audit, auditCompanyOf } from './audit.js';
import { checkSecondFactorCode } from './check-second-factor-code.js';
import type { EmailAlreadyInUse } from './create-staff-invite.js';
import { sha256Hex } from './hash.js';
import { issueStaffSession, type StaffTokens } from './issue-staff-session.js';
import { RECOVERY_CODE_COUNT, type StaffDeps } from './staff-deps.js';

/** Unknown, used, expired or out-of-tries: start again from the invite link. */
export type EnrolmentNotUsable = TaggedError<'EnrolmentNotUsable'>;
export type InvalidCode = TaggedError<'InvalidCode'>;

export interface ConfirmedStaffEnrolment extends StaffTokens {
  /** Shown once. Only their hashes are kept. */
  readonly recoveryCodes: readonly string[];
}

/**
 * Step 2 of joining: the first code from the chosen factor. On success the account is created
 * from the invite (kind, company, privileges), the invite is marked used, recovery codes are
 * issued, and the person is signed in.
 */
export async function confirmStaffEnrolment(
  deps: Pick<
    StaffDeps,
    | 'accounts'
    | 'invites'
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
  input: { readonly enrolmentId: StaffChallengeId; readonly code: string },
): Promise<
  Result<
    ConfirmedStaffEnrolment,
    EnrolmentNotUsable | InvalidCode | InviteNotUsable | EmailAlreadyInUse
  >
> {
  const now = deps.clock.now();
  const challenge = await deps.challenges.findById(input.enrolmentId);
  if (!challenge || challenge.purpose !== 'enrolment' || !isChallengeUsable(challenge, now)) {
    return err({ tag: 'EnrolmentNotUsable' });
  }

  if (!checkSecondFactorCode(deps, challenge, challenge.pendingTotpSecretCiphertext, input.code)) {
    await deps.challenges.save(recordFailedAttempt(challenge));
    return err({ tag: 'InvalidCode' });
  }

  const invite = await deps.invites.findById(challenge.inviteId);
  if (!invite || !isInviteOpen(invite, now)) return err({ tag: 'InviteNotUsable' });
  if ((await deps.accounts.findByEmail(invite.email)) !== null) {
    return err({ tag: 'EmailAlreadyInUse' });
  }

  const secondFactor: SecondFactor =
    challenge.method === 'totp'
      ? { method: 'totp', secretCiphertext: challenge.pendingTotpSecretCiphertext ?? '' }
      : challenge.method === 'sms'
        ? { method: 'sms', phone: challenge.pendingPhone ?? '' }
        : { method: 'email' };
  const base = {
    id: makeId<'StaffId'>(deps.ids.newId()),
    email: invite.email,
    name: invite.name,
    secondFactorMethod: challenge.method,
    createdAt: now,
  };
  let staff: StaffAccount;
  if (invite.kind === 'platform') {
    staff = { ...base, kind: 'platform' };
  } else {
    if (invite.companyId === undefined) throw new Error(`fleet invite ${invite.id} has no company`);
    staff = { ...base, kind: 'fleet', companyId: invite.companyId, privileges: invite.privileges };
  }

  await deps.accounts.create(staff, {
    staffId: staff.id,
    passwordHash: challenge.pendingPasswordHash,
    secondFactor,
  });
  await deps.invites.save({ ...invite, acceptedAt: now });
  await deps.challenges.save(consumeChallenge(challenge, now));

  const recoveryCodes = deps.randomCodes.recoveryCodes(RECOVERY_CODE_COUNT);
  await deps.recoveryCodes.replaceAll(staff.id, recoveryCodes.map(sha256Hex));
  await audit(deps, {
    action: 'staff_joined',
    actorId: staff.id,
    companyId: auditCompanyOf(staff),
    targetId: staff.id,
    details: { method: challenge.method, invitedBy: invite.invitedBy ?? 'bootstrap' },
  });

  const tokens = await issueStaffSession(deps, staff);
  return ok({ ...tokens, recoveryCodes });
}
