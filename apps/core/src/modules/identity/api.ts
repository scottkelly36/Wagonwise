import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { UnitOfWork } from '../../shared/ports/unit-of-work.js';
import type { OtpSender } from './application/ports/otp-sender.js';
import type { TokenSigner } from './application/ports/token-signer.js';
import type { CompanyId, DriverId, DriverScope } from './domain/driver.js';
import { ChannelRoutingOtpSender } from './infrastructure/channel-routing-otp-sender.js';
import { ClickSendOtpSender } from './infrastructure/clicksend-otp-sender.js';
import { ConsoleOtpSender } from './infrastructure/console-otp-sender.js';
import { ResendOtpSender } from './infrastructure/resend-otp-sender.js';
import { CryptoInviteCodeGenerator } from './infrastructure/crypto-invite-code-generator.js';
import { CryptoOtpCodeGenerator } from './infrastructure/crypto-otp-code-generator.js';
import { CryptoRefreshTokenGenerator } from './infrastructure/crypto-refresh-token-generator.js';
import type { UntypedDb } from './infrastructure/db.js';
import { Ed25519TokenSigner } from './infrastructure/ed25519-token-signer.js';
import { PostgresDeviceRepository } from './infrastructure/postgres-device-repository.js';
import { PostgresDriverRepository } from './infrastructure/postgres-driver-repository.js';
import { PostgresInviteCodeRepository } from './infrastructure/postgres-invite-code-repository.js';
import { PostgresOtpRepository } from './infrastructure/postgres-otp-repository.js';
import { PostgresSessionRepository } from './infrastructure/postgres-session-repository.js';
import { registerIdentityRoutes, type IdentityRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { OtpSender } from './application/ports/otp-sender.js';
export type { TokenSigner } from './application/ports/token-signer.js';
export type { UntypedDb } from './infrastructure/db.js';

/**
 * `identity`'s only public surface (AGENTS.md rule 6). Everything under `domain/`, `application/`,
 * `infrastructure/` and `interface/` is reachable only through here — enforced by the
 * `modules-reachable-only-through-api` dependency-cruiser rule (decision 29).
 *
 * Split in two rather than one factory: building the `TokenSigner` is async (key generation/
 * import), but `composeCore` wires everything else synchronously, matching every other module's
 * expected shape. `main.ts` awaits `createTokenSigner` once at boot and passes the result in.
 */
export async function createTokenSigner(
  identityPrivateKeyPem: string | undefined,
): Promise<TokenSigner> {
  return identityPrivateKeyPem
    ? Ed25519TokenSigner.fromPkcs8Pem(identityPrivateKeyPem)
    : Ed25519TokenSigner.generateEphemeral();
}

export interface IdentityModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly tokenSigner: TokenSigner;
  /** Both set wires `ClickSendOtpSender` for phone-identifier OTPs; either unset falls back to
   *  the local-dev `ConsoleOtpSender` for that channel — same "real adapter behind a config
   *  toggle" precedent as hazards' `anthropicApiKey` (hazards/api.ts). */
  readonly clickSendUsername?: string | undefined;
  readonly clickSendApiKey?: string | undefined;
  /** Set wires `ResendOtpSender` for email-identifier OTPs; unset falls back to
   *  `ConsoleOtpSender` for that channel. `resendFromEmail` defaults to Resend's own sandbox
   *  sender (resend-otp-sender.ts) if unset. The two channels are independent — SMS can be real
   *  while email still falls back to console, or vice versa. */
  readonly resendApiKey?: string | undefined;
  readonly resendFromEmail?: string | undefined;
  /** Defaults to a `ChannelRoutingOtpSender` built from the four fields above — override (e.g.
   *  with a fake) for tests or a local run that shouldn't reach ClickSend's/Resend's real
   *  endpoints. */
  readonly otpSender?: OtpSender | undefined;
}

export interface IdentityModule {
  registerRoutes(app: FastifyInstance): void;
  /** Every push token currently registered to a driver — the read-model routing's future
   *  reroute subscriber wraps (design doc §6: "device tokens come from a read-model port onto
   *  Identity"; that adapter, in routing's own `infrastructure/`, translates this into
   *  routing's own types, per rule 7 — identity never sees what routing does with it). Plain
   *  strings, not `Device`s: nothing outside identity needs a device's id or timestamps, only
   *  what a `PushNotifier` actually sends to. Unconsumed until M6.4 gives it a real caller. */
  getPushTokensForDriver(driverId: DriverId): Promise<string[]>;
  /** The read-model hazards' `AdminDirectory` wraps (`hazards/infrastructure/
   *  identity-admin-directory.ts`, 2026-09-26) for its true-delete action — identity owns whether
   *  a driver is an admin; a caller with no such driver gets `false`, not an error, since "does
   *  this id resolve to an admin" is itself the whole question, never a precondition failure. */
  isDriverAdmin(driverId: DriverId): Promise<boolean>;
  /** The read-model `fleet`'s own `CallerDirectory` wraps (`fleet/infrastructure/
   *  identity-caller-directory.ts`) — everything a cross-context authorization check needs about
   *  a driver in one call, rather than three. `null` for an unknown id, same "the id not
   *  resolving is itself the answer" reasoning as `isDriverAdmin`. */
  getDriverAccess(
    driverId: DriverId,
  ): Promise<{ isAdmin: boolean; companyId?: CompanyId; scopes: readonly DriverScope[] } | null>;
  /** Delivers a one-time code by text (a phone number) or email, through the same senders drivers'
   *  sign-in codes use (ClickSend / Resend, or the console in local dev). Staff second factors
   *  (P2-M1.4) reach it through `companies`' own `CodeSender` port, so ClickSend/Resend accounts
   *  and credentials stay configured in one place. */
  sendOneTimeCode(destination: string, code: string): Promise<void>;
  /** Signs a staff access token (`kind: 'staff'`) with core's one Ed25519 key, so the staff BFF
   *  verifies it from the same JWKS as drivers' tokens. `companies` owns staff sessions and wraps
   *  this in its own `StaffTokenIssuer` port (P2-M1.6). */
  signStaffAccessToken(staffId: string, sessionId: string): Promise<string>;
}

/**
 * The module's own composition root (M1.3 deviations decision, `docs/progress.md`): identity
 * wires its own adapters to its own ports here; `composition/` only calls this and registers the
 * result, never reaching into `infrastructure/` itself.
 */
export function createIdentityModule(deps: IdentityModuleDeps): IdentityModule {
  const driverRepo = new PostgresDriverRepository(deps.db);
  const inviteCodeRepo = new PostgresInviteCodeRepository(deps.db);
  const sessionRepo = new PostgresSessionRepository(deps.db);
  const otpRepo = new PostgresOtpRepository(deps.db);
  const deviceRepo = new PostgresDeviceRepository(deps.db);
  const smsSender =
    deps.clickSendUsername !== undefined && deps.clickSendApiKey !== undefined
      ? new ClickSendOtpSender(deps.clickSendUsername, deps.clickSendApiKey)
      : new ConsoleOtpSender();
  const emailSender =
    deps.resendApiKey !== undefined
      ? new ResendOtpSender(deps.resendApiKey, deps.resendFromEmail)
      : new ConsoleOtpSender();
  const otpSender = deps.otpSender ?? new ChannelRoutingOtpSender(smsSender, emailSender);
  const otpCodeGenerator = new CryptoOtpCodeGenerator();
  const refreshTokenGenerator = new CryptoRefreshTokenGenerator();
  const inviteCodeGenerator = new CryptoInviteCodeGenerator();

  const routeDeps: IdentityRouteDeps = {
    requestOtp: {
      driverRepo,
      inviteCodeRepo,
      otpRepo,
      otpSender,
      otpCodeGenerator,
      clock: deps.clock,
      ids: deps.ids,
    },
    verifyOtp: {
      driverRepo,
      inviteCodeRepo,
      otpRepo,
      sessionRepo,
      tokenSigner: deps.tokenSigner,
      refreshTokenGenerator,
      unitOfWork: deps.unitOfWork,
      clock: deps.clock,
      ids: deps.ids,
    },
    refreshToken: {
      sessionRepo,
      tokenSigner: deps.tokenSigner,
      refreshTokenGenerator,
      clock: deps.clock,
    },
    revokeSession: { sessionRepo, clock: deps.clock },
    registerDevice: { repo: deviceRepo, clock: deps.clock, ids: deps.ids },
    giveConsent: { driverRepo, clock: deps.clock },
    deleteAccount: { driverRepo, sessionRepo, deviceRepo, clock: deps.clock },
    listDrivers: { driverRepo },
    updateDriver: { driverRepo },
    createInviteCode: {
      repo: inviteCodeRepo,
      generator: inviteCodeGenerator,
      clock: deps.clock,
      driverRepo,
    },
    listInviteCodes: { repo: inviteCodeRepo, driverRepo },
    tokenSigner: deps.tokenSigner,
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerIdentityRoutes(app, routeDeps);
    },
    async getPushTokensForDriver(driverId: DriverId): Promise<string[]> {
      const devices = await deviceRepo.findByDriverId(driverId);
      return devices.map((device) => device.pushToken);
    },
    async isDriverAdmin(driverId: DriverId): Promise<boolean> {
      const driver = await driverRepo.findById(driverId);
      return driver?.isAdmin ?? false;
    },
    async getDriverAccess(driverId: DriverId) {
      const driver = await driverRepo.findById(driverId);
      if (!driver) return null;
      return {
        isAdmin: driver.isAdmin,
        ...(driver.companyId === undefined ? {} : { companyId: driver.companyId }),
        scopes: driver.scopes,
      };
    },
    sendOneTimeCode(destination: string, code: string): Promise<void> {
      return otpSender.send(destination, code);
    },
    signStaffAccessToken(staffId: string, sessionId: string): Promise<string> {
      return deps.tokenSigner.signStaffAccessToken({ staffId, sessionId });
    },
  };
}
