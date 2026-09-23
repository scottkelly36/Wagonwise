import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { UnitOfWork } from '../../shared/ports/unit-of-work.js';
import type { OtpSender } from './application/ports/otp-sender.js';
import type { TokenSigner } from './application/ports/token-signer.js';
import type { DriverId } from './domain/driver.js';
import { ConsoleOtpSender } from './infrastructure/console-otp-sender.js';
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
  /** Defaults to the local-dev console adapter — see application/ports/otp-sender.ts. */
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
  const otpSender = deps.otpSender ?? new ConsoleOtpSender();
  const otpCodeGenerator = new CryptoOtpCodeGenerator();
  const refreshTokenGenerator = new CryptoRefreshTokenGenerator();

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
  };
}
