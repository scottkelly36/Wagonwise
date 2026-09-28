import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { IdentityModule } from '../identity/api.js';
import { IdentityAdminDirectory } from './infrastructure/identity-admin-directory.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresCompanyRepository } from './infrastructure/postgres-company-repository.js';
import { registerCompaniesRoutes, type CompaniesRouteDeps } from './interface/routes.js';
import type { StaffDeps } from './application/staff-deps.js';
import { AesGcmSecretBox } from './infrastructure/aes-gcm-secret-box.js';
import { CryptoRandomCodes } from './infrastructure/crypto-random-codes.js';
import { IdentityCodeSender } from './infrastructure/identity-code-sender.js';
import { IdentityStaffTokenIssuer } from './infrastructure/identity-staff-token-issuer.js';
import { PostgresStaffAccountRepository } from './infrastructure/postgres-staff-account-repository.js';
import { PostgresStaffChallengeRepository } from './infrastructure/postgres-staff-challenge-repository.js';
import { PostgresStaffInviteRepository } from './infrastructure/postgres-staff-invite-repository.js';
import { PostgresStaffRecoveryCodeRepository } from './infrastructure/postgres-staff-recovery-code-repository.js';
import { PostgresStaffSessionRepository } from './infrastructure/postgres-staff-session-repository.js';
import { Rfc6238Totp } from './infrastructure/rfc6238-totp.js';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher.js';
import { registerStaffRoutes } from './interface/staff-routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface CompaniesModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Row-Level Security scope per staff request (P2-M1.7). */
  readonly dataScopes: DataScopes;
  /** The cross-context calls this module makes (AGENTS.md rule 7), each wrapped by an adapter in
   *  `infrastructure/`: the admin gate (`isDriverAdmin`), and for staff sign-in (P2-M1.6)
   *  sending codes through drivers' SMS/email senders and signing staff tokens with core's key. */
  readonly identity: Pick<
    IdentityModule,
    'isDriverAdmin' | 'sendOneTimeCode' | 'signStaffAccessToken'
  >;
  /** Base64 32-byte key for staff TOTP secrets (config's STAFF_SECRET_KEY). Undefined: a fresh
   *  key per boot, local dev only. */
  readonly staffSecretKey?: string | undefined;
}

export interface CompaniesModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `companies`'s only public surface (AGENTS.md rule 6). Everything under `domain/`,
 * `application/`, `infrastructure/` and `interface/` is reachable only through here — same
 * pattern as every other module. Phase 1 of the business-facing dashboard (2026-09-27): just
 * enough backend for an admin to create and list companies, and (via identity's own
 * `updateDriver`) assign a driver to one. No read-model exposed to any other module yet — nothing
 * outside `companies` and `identity` needs to know a company exists.
 */
export function createCompaniesModule(deps: CompaniesModuleDeps): CompaniesModule {
  const repo = new PostgresCompanyRepository(deps.db);
  const adminDirectory = new IdentityAdminDirectory(deps.identity);

  const routeDeps: CompaniesRouteDeps = {
    createCompany: { repo, clock: deps.clock },
    companyRepo: repo,
    adminDirectory,
  };

  const staffDeps: StaffDeps = {
    accounts: new PostgresStaffAccountRepository(deps.db),
    invites: new PostgresStaffInviteRepository(deps.db),
    sessions: new PostgresStaffSessionRepository(deps.db),
    challenges: new PostgresStaffChallengeRepository(deps.db),
    recoveryCodes: new PostgresStaffRecoveryCodeRepository(deps.db),
    passwordHasher: new ScryptPasswordHasher(),
    secretBox: new AesGcmSecretBox(
      deps.staffSecretKey === undefined
        ? randomBytes(32)
        : Buffer.from(deps.staffSecretKey, 'base64'),
    ),
    totp: new Rfc6238Totp(),
    codeSender: new IdentityCodeSender((destination, code) =>
      deps.identity.sendOneTimeCode(destination, code),
    ),
    randomCodes: new CryptoRandomCodes(),
    tokenIssuer: new IdentityStaffTokenIssuer((staffId, sessionId) =>
      deps.identity.signStaffAccessToken(staffId, sessionId),
    ),
    clock: deps.clock,
    ids: deps.ids,
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerCompaniesRoutes(app, routeDeps);
      registerStaffRoutes(app, staffDeps, deps.dataScopes);
    },
  };
}
