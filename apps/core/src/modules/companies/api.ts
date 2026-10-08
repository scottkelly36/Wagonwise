import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { makeId } from '../../shared/brand.js';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { IdentityModule } from '../identity/api.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresCompanyRepository } from './infrastructure/postgres-company-repository.js';
import { registerCompaniesRoutes, type CompaniesRouteDeps } from './interface/routes.js';
import { bootstrapFirstAdmin as bootstrapFirstAdminUseCase } from './application/bootstrap-first-admin.js';
import type { StaffDeps } from './application/staff-deps.js';
import { AesGcmSecretBox } from './infrastructure/aes-gcm-secret-box.js';
import { CryptoRandomCodes } from './infrastructure/crypto-random-codes.js';
import { IdentityCodeSender } from './infrastructure/identity-code-sender.js';
import { IdentityInviteMailer } from './infrastructure/identity-invite-mailer.js';
import { IdentityStaffTokenIssuer } from './infrastructure/identity-staff-token-issuer.js';
import { PostgresStaffAccountRepository } from './infrastructure/postgres-staff-account-repository.js';
import { PostgresStaffAuditLog } from './infrastructure/postgres-staff-audit-log.js';
import { PostgresStaffChallengeRepository } from './infrastructure/postgres-staff-challenge-repository.js';
import { PostgresStaffInviteRepository } from './infrastructure/postgres-staff-invite-repository.js';
import { PostgresStaffRecoveryCodeRepository } from './infrastructure/postgres-staff-recovery-code-repository.js';
import { PostgresStaffSessionRepository } from './infrastructure/postgres-staff-session-repository.js';
import { Rfc6238Totp } from './infrastructure/rfc6238-totp.js';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher.js';
import { StaffCallers, type StaffCallerView } from './infrastructure/staff-callers.js';
import { registerStaffRoutes } from './interface/staff-routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';
export type { StaffCallerView } from './infrastructure/staff-callers.js';

export interface CompaniesModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Row-Level Security scope per staff request (P2-M1.7). */
  readonly dataScopes: DataScopes;
  /** The cross-context calls this module makes (AGENTS.md rule 7), each wrapped by an adapter in
   *  `infrastructure/`: for staff sign-in (P2-M1.6), sending codes through drivers' SMS/email
   *  senders and signing staff tokens with core's key. */
  readonly identity: Pick<IdentityModule, 'sendOneTimeCode' | 'sendEmail' | 'signStaffAccessToken'>;
  /** The dashboard's address (config's DASHBOARD_URL), so a staff invitation can be emailed as a link.
   *  Undefined: invitations are not emailed and the inviter shares the link. */
  readonly dashboardUrl?: string | undefined;
  /** Base64 32-byte key for staff TOTP secrets (config's STAFF_SECRET_KEY). Undefined: a fresh
   *  key per boot, local dev only. */
  readonly staffSecretKey?: string | undefined;
}

export interface CompaniesModule {
  registerRoutes(app: FastifyInstance): void;
  /**
   * Who a signed-in staff member is, for other modules' permission checks (P2-M1.12c): identity,
   * hazards and fleet wrap this in their own ports. `null` for an unknown or removed account.
   * Runs its own scope, so call it outside any `DataScopes.run`.
   */
  getStaffCaller(staffId: string): Promise<StaffCallerView | null>;
  /** Company names by id, for screens in other modules that show who a link is with (fleet's
   *  driver links). Ids that match no company are simply absent. */
  getCompanyNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** How many months each company keeps its proof-of-delivery photos, by company id, for the daily cleanup. */
  listPhotoRetention(): Promise<ReadonlyMap<string, number>>;
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
  const staffCallers = new StaffCallers(
    new PostgresStaffAccountRepository(deps.db),
    deps.dataScopes,
  );

  const routeDeps: CompaniesRouteDeps = {
    createCompany: { repo, clock: deps.clock, admins: staffCallers },
    listCompanies: { repo, admins: staffCallers },
  };

  const staffDeps: StaffDeps = {
    accounts: new PostgresStaffAccountRepository(deps.db),
    companies: repo,
    invites: new PostgresStaffInviteRepository(deps.db),
    sessions: new PostgresStaffSessionRepository(deps.db),
    challenges: new PostgresStaffChallengeRepository(deps.db),
    recoveryCodes: new PostgresStaffRecoveryCodeRepository(deps.db),
    auditLog: new PostgresStaffAuditLog(deps.db),
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
    inviteMailer: new IdentityInviteMailer((to, subject, text) =>
      deps.identity.sendEmail(to, subject, text),
    ),
    dashboardUrl: deps.dashboardUrl,
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
    getStaffCaller(staffId: string) {
      return staffCallers.get(makeId<'StaffId'>(staffId));
    },
    async listPhotoRetention(): Promise<ReadonlyMap<string, number>> {
      const all = await repo.findAll();
      return new Map(all.map((c) => [c.id, c.photoRetentionMonths]));
    },
    async getCompanyNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
      // Few companies, and companies.companies carries no company-scoped RLS, so a driver can ask.
      const wanted = new Set(ids);
      const all = await repo.findAll();
      return new Map(all.filter((c) => wanted.has(c.id)).map((c) => [c.id, c.name]));
    },
  };
}

/**
 * `pnpm staff:bootstrap`'s entry point (P2-M1.12b): issues the invite for the first WagonWise
 * admin, refused once any exists. Returns the invite link token (shown once), or why not.
 */
export async function bootstrapFirstAdmin(
  deps: Pick<CompaniesModuleDeps, 'db' | 'clock' | 'ids' | 'dataScopes'>,
  input: { readonly email: string; readonly name: string },
): Promise<
  | { readonly ok: true; readonly token: string; readonly expiresAt: Date }
  | { readonly ok: false; readonly reason: 'AdminAlreadyExists' | 'EmailAlreadyInUse' }
> {
  const result = await deps.dataScopes.run({ kind: 'platform' }, () =>
    bootstrapFirstAdminUseCase(
      {
        accounts: new PostgresStaffAccountRepository(deps.db),
        invites: new PostgresStaffInviteRepository(deps.db),
        auditLog: new PostgresStaffAuditLog(deps.db),
        randomCodes: new CryptoRandomCodes(),
        clock: deps.clock,
        ids: deps.ids,
      },
      input,
    ),
  );
  return result.ok
    ? { ok: true, token: result.value.token, expiresAt: result.value.invite.expiresAt }
    : { ok: false, reason: result.error.tag };
}
