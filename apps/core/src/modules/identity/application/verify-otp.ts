import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { UnitOfWork } from '../../../shared/ports/unit-of-work.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { Driver, DriverId } from '../domain/driver.js';
import { normalizeIdentifier, type InvalidIdentifier } from '../domain/identifier.js';
import { isRedeemed, redeem } from '../domain/invite-code.js';
import {
  verify as verifyOtpCode,
  type OtpAlreadyConsumed,
  type OtpExpired,
  type OtpIncorrect,
  type TooManyAttempts,
} from '../domain/otp.js';
import { REFRESH_LIFETIME_MS, type Session } from '../domain/session.js';
import type { InvalidInviteCode, InviteCodeRequired } from './errors.js';
import { sha256Hex } from './hash.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';
import type { OtpRepository } from './ports/otp-repository.js';
import type { RefreshTokenGenerator } from './ports/refresh-token-generator.js';
import type { SessionRepository } from './ports/session-repository.js';
import type { AccessTokenClaims, TokenSigner } from './ports/token-signer.js';

export type OtpNotFound = TaggedError<'OtpNotFound'>;

export interface VerifyOtpDeps {
  readonly driverRepo: DriverRepository;
  readonly inviteCodeRepo: InviteCodeRepository;
  readonly otpRepo: OtpRepository;
  readonly sessionRepo: SessionRepository;
  readonly tokenSigner: TokenSigner;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface VerifyOtpInput {
  readonly identifier: string;
  readonly code: string;
  /** Required only when no Driver exists yet for this identifier (first sign-in). `| undefined`
   *  (not just optional) so a zod-parsed body — whose `.optional()` types the key exactly this
   *  way — is assignable under exactOptionalPropertyTypes without a cast at the call site. */
  readonly inviteCode?: string | undefined;
}

export interface VerifyOtpResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly driver: Driver;
}

export type VerifyOtpError =
  | InvalidIdentifier
  | OtpNotFound
  | OtpExpired
  | OtpAlreadyConsumed
  | OtpIncorrect
  | TooManyAttempts
  | InviteCodeRequired
  | InvalidInviteCode;

/**
 * Confirms a code, creating the Driver (redeeming the invite code atomically via UnitOfWork,
 * decision 4) on a first sign-in, and issues a session: an access token plus a refresh token.
 */
export async function verifyOtp(
  deps: VerifyOtpDeps,
  input: VerifyOtpInput,
): Promise<Result<VerifyOtpResult, VerifyOtpError>> {
  const normalized = normalizeIdentifier(input.identifier);
  if (!normalized.ok) {
    return normalized;
  }
  const identifier = normalized.value;
  const now = deps.clock.now();

  const otp = await deps.otpRepo.findLatestFor(identifier);
  if (!otp) {
    return err({ tag: 'OtpNotFound' });
  }
  const { outcome, next } = verifyOtpCode(otp, sha256Hex(input.code), now);
  await deps.otpRepo.save(identifier, next); // always persist — a wrong guess still counts
  if (!outcome.ok) {
    return outcome;
  }

  let driver = await deps.driverRepo.findByIdentifier(identifier);
  if (!driver) {
    const created = await createDriverFromInvite(deps, identifier, input.inviteCode, now);
    if (!created.ok) {
      return created;
    }
    driver = created.value;
  }

  const rawRefreshToken = deps.refreshTokenGenerator.next();
  const session: Session = {
    id: makeId<'SessionId'>(deps.ids.newId()),
    driverId: driver.id,
    refreshTokenHash: sha256Hex(rawRefreshToken),
    previousRefreshTokenHash: null,
    issuedAt: now,
    lastUsedAt: now,
    refreshExpiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
    revokedAt: null,
  };
  await deps.sessionRepo.save(session);

  const claims: AccessTokenClaims = { driverId: driver.id, sessionId: session.id };
  const accessToken = await deps.tokenSigner.signAccessToken(claims);

  return ok({ accessToken, refreshToken: rawRefreshToken, driver });
}

async function createDriverFromInvite(
  deps: VerifyOtpDeps,
  identifier: string,
  inviteCode: string | undefined,
  now: Date,
): Promise<Result<Driver, InviteCodeRequired | InvalidInviteCode>> {
  if (!inviteCode) {
    return err({ tag: 'InviteCodeRequired' });
  }
  const invite = await deps.inviteCodeRepo.findByCode(inviteCode);
  if (!invite || isRedeemed(invite)) {
    return err({ tag: 'InvalidInviteCode' });
  }

  const driverId: DriverId = makeId<'DriverId'>(deps.ids.newId());
  const newDriver: Driver = {
    id: driverId,
    identifier,
    createdAt: now,
  };
  const redeemed = redeem(invite, driverId, now);
  if (!redeemed.ok) {
    // Lost a race with another verify() call for the same code, between the check above and
    // here — rare at Phase 1 scale. Not a domain Result: there is no sane per-driver response,
    // so this surfaces as a thrown (infra-level) error and the caller retries with a fresh code.
    throw new Error('invite code redeemed concurrently');
  }

  await deps.unitOfWork.run(async (tx) => {
    await deps.driverRepo.save(newDriver, tx);
    await deps.inviteCodeRepo.save(redeemed.value, tx);
  });
  return ok(newDriver);
}
