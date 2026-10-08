import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { normalizeIdentifier, type InvalidIdentifier } from '../domain/identifier.js';
import { isRedeemed } from '../domain/invite-code.js';
import type { Otp } from '../domain/otp.js';
import type { CodeNotSent, InvalidInviteCode, InviteCodeRequired } from './errors.js';
import { sha256Hex } from './hash.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';
import type { OtpCodeGenerator } from './ports/otp-code-generator.js';
import type { OtpRepository } from './ports/otp-repository.js';
import type { OtpSender } from './ports/otp-sender.js';

export interface RequestOtpDeps {
  readonly driverRepo: DriverRepository;
  readonly inviteCodeRepo: InviteCodeRepository;
  readonly otpRepo: OtpRepository;
  readonly otpSender: OtpSender;
  readonly otpCodeGenerator: OtpCodeGenerator;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface RequestOtpInput {
  readonly identifier: string;
  /** Required only when no Driver exists yet for this identifier (first sign-in). `| undefined`
   *  (not just optional) so a zod-parsed body — whose `.optional()` types the key exactly this
   *  way — is assignable under exactOptionalPropertyTypes without a cast at the call site. */
  readonly inviteCode?: string | undefined;
}

export const OTP_TTL_MS = 10 * 60 * 1000;

export type RequestOtpError =
  InvalidIdentifier | InviteCodeRequired | InvalidInviteCode | CodeNotSent;

/**
 * Sends a one-time code. For a new identifier, validates an invite code without redeeming it —
 * redemption happens atomically with actually creating the Driver, in verify-otp.ts, so an
 * abandoned request (never followed by verify) never burns a code.
 */
export async function requestOtp(
  deps: RequestOtpDeps,
  input: RequestOtpInput,
): Promise<Result<void, RequestOtpError>> {
  const normalized = normalizeIdentifier(input.identifier);
  if (!normalized.ok) {
    return normalized;
  }
  const identifier = normalized.value;

  const existingDriver = await deps.driverRepo.findByIdentifier(identifier);
  if (!existingDriver) {
    if (!input.inviteCode) {
      return err({ tag: 'InviteCodeRequired' });
    }
    const invite = await deps.inviteCodeRepo.findByCode(input.inviteCode);
    if (!invite || isRedeemed(invite)) {
      return err({ tag: 'InvalidInviteCode' });
    }
  }

  const code = deps.otpCodeGenerator.next();
  const now = deps.clock.now();
  const otp: Otp = {
    id: deps.ids.newId(),
    codeHash: sha256Hex(code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    consumedAt: null,
    attempts: 0,
  };
  await deps.otpRepo.save(identifier, otp);
  try {
    await deps.otpSender.send(identifier, code);
  } catch (cause) {
    // The provider refused or could not be reached. The caller logs why; the driver is told the code was
    // not sent, instead of an unexplained failure.
    return err({ tag: 'CodeNotSent', cause });
  }
  return ok(undefined);
}
