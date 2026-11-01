import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { Otp } from '../domain/otp.js';
import type { CodeNotSent } from './errors.js';
import { sha256Hex } from './hash.js';
import type { OtpCodeGenerator } from './ports/otp-code-generator.js';
import type { OtpRepository } from './ports/otp-repository.js';
import type { OtpSender } from './ports/otp-sender.js';

export const OTP_TTL_MS = 10 * 60 * 1000;

export interface IssueOtpDeps {
  readonly otpRepo: OtpRepository;
  readonly otpSender: OtpSender;
  readonly otpCodeGenerator: OtpCodeGenerator;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** Makes a one-time code, keeps only its hash, and sends the code to the identifier. A newer code replaces an older one. */
export async function issueOtp(
  deps: IssueOtpDeps,
  identifier: string,
): Promise<Result<void, CodeNotSent>> {
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
    // The provider refused or could not be reached. The caller logs why; the driver is told the code was not sent.
    return err({ tag: 'CodeNotSent', cause });
  }
  return ok(undefined);
}
