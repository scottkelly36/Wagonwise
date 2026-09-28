import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { SecondFactorMethod } from '../domain/staff-account.js';
import {
  STAFF_CHALLENGE_LIFETIME_MS,
  type EnrolmentChallenge,
  type StaffChallengeId,
} from '../domain/staff-challenge.js';
import { isInviteOpen } from '../domain/staff-invite.js';
import type { EmailAlreadyInUse } from './create-staff-invite.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

/** Unknown, expired or already-used invite link: one error, so a link's state isn't revealed. */
export type InviteNotUsable = TaggedError<'InviteNotUsable'>;
export type CodeNotSent = TaggedError<'CodeNotSent'>;

export interface AcceptStaffInviteInput {
  readonly inviteToken: string;
  readonly password: string;
  readonly secondFactorMethod: SecondFactorMethod;
  /** Required for `sms` (contracts check the format). */
  readonly phone?: string | undefined;
}

export interface AcceptedStaffInvite {
  readonly enrolmentId: StaffChallengeId;
  readonly secondFactorMethod: SecondFactorMethod;
  /** Authenticator apps only: the otpauth:// link to show as a QR code. */
  readonly totpUri?: string | undefined;
}

/**
 * Step 1 of joining: password and chosen second factor. Nothing is created yet except a pending
 * enrolment; the account only exists once the first code proves the factor works
 * (`confirmStaffEnrolment`), so there's never a half-set-up account.
 */
export async function acceptStaffInvite(
  deps: Pick<
    StaffDeps,
    | 'accounts'
    | 'invites'
    | 'challenges'
    | 'passwordHasher'
    | 'secretBox'
    | 'totp'
    | 'codeSender'
    | 'randomCodes'
    | 'clock'
    | 'ids'
  >,
  input: AcceptStaffInviteInput,
): Promise<Result<AcceptedStaffInvite, InviteNotUsable | EmailAlreadyInUse | CodeNotSent>> {
  const now = deps.clock.now();
  const invite = await deps.invites.findByTokenHash(sha256Hex(input.inviteToken));
  if (!invite || !isInviteOpen(invite, now)) return err({ tag: 'InviteNotUsable' });
  if ((await deps.accounts.findByEmail(invite.email)) !== null) {
    return err({ tag: 'EmailAlreadyInUse' });
  }
  if (input.secondFactorMethod === 'sms' && input.phone === undefined) {
    throw new Error('acceptStaffInvite: sms needs a phone (contracts should have caught this)');
  }

  let codeHash: string | null = null;
  let totpSecret: string | null = null;
  let codeToSend: { destination: string; code: string } | null = null;
  if (input.secondFactorMethod === 'totp') {
    totpSecret = deps.totp.generateSecret();
  } else {
    const code = deps.randomCodes.sixDigitCode();
    codeHash = sha256Hex(code);
    codeToSend = {
      destination: input.secondFactorMethod === 'sms' ? (input.phone ?? '') : invite.email,
      code,
    };
  }

  const challenge: EnrolmentChallenge = {
    id: makeId<'StaffChallengeId'>(deps.ids.newId()),
    purpose: 'enrolment',
    inviteId: invite.id,
    method: input.secondFactorMethod,
    codeHash,
    pendingPasswordHash: await deps.passwordHasher.hash(input.password),
    pendingTotpSecretCiphertext: totpSecret === null ? null : deps.secretBox.encrypt(totpSecret),
    pendingPhone: input.secondFactorMethod === 'sms' ? (input.phone ?? null) : null,
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + STAFF_CHALLENGE_LIFETIME_MS),
    consumedAt: null,
  };
  await deps.challenges.save(challenge);

  if (codeToSend !== null) {
    try {
      await deps.codeSender.send(codeToSend.destination, codeToSend.code);
    } catch {
      return err({ tag: 'CodeNotSent' });
    }
  }

  return ok({
    enrolmentId: challenge.id,
    secondFactorMethod: input.secondFactorMethod,
    totpUri: totpSecret === null ? undefined : deps.totp.provisioningUri(totpSecret, invite.email),
  });
}
