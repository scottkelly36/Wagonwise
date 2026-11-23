import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { makeId } from '../../shared/brand.js';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { IdentityModule } from '../identity/api.js';
import type { UntypedDb } from './infrastructure/db.js';
import { isPaused } from './domain/account-state.js';
import { PostgresAccountEmailLog } from './infrastructure/postgres-account-email-log.js';
import { PostgresAccountStateRepository } from './infrastructure/postgres-account-state-repository.js';
import { PostgresCompanyRepository } from './infrastructure/postgres-company-repository.js';
import { runAccountRules, type AccountRuleOutcome } from './application/run-account-rules.js';
import { createStaffRequestGate, type StaffRequestGate } from './application/staff-request-gate.js';
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
// The requests a paused company may still make, so a composition test can check each is a real route.
export { OPEN_WHEN_PAUSED } from './domain/account-state.js';
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
  /** Where a line to the owner goes whenever WagonWise writes to a company about its account (config's ALERT_EMAIL). Undefined: none. */
  readonly ownerNotice?: { send(subject: string, text: string): Promise<void> } | undefined;
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
  /**
   * Is this staff request refused because the staff member's company is paused? True: answer `account_paused`. Reads and the few
   * requests a paused company may still make cost nothing; WagonWise staff are never refused. Runs its own scope, so call it
   * outside any `DataScopes.run`. `host/staff-auth.ts` calls it for every `/staff/*` request (docs/company-account-states-scope.md).
   */
  isStaffRequestRefused: StaffRequestGate;
  /**
   * The company's name when its account is paused, else `null` (also for an unknown company). Drivers' jobs and hours sharing ask
   * it, so a paused firm's drivers are held back (docs/company-account-states-scope.md). Works in any data scope. A state change is
   * seen within a few seconds.
   */
  pausedCompanyName(companyId: string): Promise<string | null>;
  /**
   * The automatic rules for company account states (the trial emails, trial to overdue, overdue to paused): see
   * `application/run-account-rules.ts`. Runs in WagonWise staff's data scope, so call it outside any `DataScopes.run`. Does nothing while
   * the setting is off or before 7am UK. Run hourly by composition.
   */
  runAccountRules(): Promise<AccountRuleOutcome>;
  /** How many months each company keeps its proof-of-delivery photos, by company id, for the daily cleanup. */
  listPhotoRetention(): Promise<ReadonlyMap<string, number>>;
  /** Every company's id and name, for billing's admin screens. */
  listCompanyNames(): Promise<readonly { readonly id: string; readonly name: string }[]>;
  /**
   * The live fleet accounts of a company, with their email and what they may do, for maintenance's morning reminder.
   * Opens its own data scope, so call it outside any other `DataScopes.run`.
   */
  listFleetContacts(companyId: string): Promise<
    readonly {
      readonly staffId: string;
      readonly name: string;
      readonly email: string;
      readonly privileges: readonly string[];
    }[]
  >;
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
  const accountStates = new PostgresAccountStateRepository(deps.db);
  const staffCallers = new StaffCallers(
    new PostgresStaffAccountRepository(deps.db),
    deps.dataScopes,
  );

  const staffRequestGate = createStaffRequestGate({
    callers: staffCallers,
    states: accountStates,
    scopes: deps.dataScopes,
    clock: deps.clock,
  });

  // A company's paused name, remembered a few seconds: a driver's phone reports a position every few seconds.
  const pausedNames = new Map<string, { readonly name: string | null; readonly until: number }>();

  const routeDeps: CompaniesRouteDeps = {
    createCompany: { repo, states: accountStates, clock: deps.clock, admins: staffCallers },
    listCompanies: { repo, states: accountStates, admins: staffCallers },
  };

  const staffDeps: StaffDeps = {
    accounts: new PostgresStaffAccountRepository(deps.db),
    companies: repo,
    states: accountStates,
    emailLog: new PostgresAccountEmailLog(deps.db),
    mailer: { send: (to, subject, text) => deps.identity.sendEmail(to, subject, text) },
    ownerNotice: deps.ownerNotice,
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

  const rulesPass = () =>
    runAccountRules({
      states: accountStates,
      companies: repo,
      accounts: staffDeps.accounts,
      emailLog: staffDeps.emailLog,
      mailer: staffDeps.mailer,
      ownerNotice: deps.ownerNotice,
      dashboardUrl: deps.dashboardUrl,
      clock: deps.clock,
      ids: deps.ids,
      scoped: (work) => deps.dataScopes.run({ kind: 'platform' }, work),
    });

  return {
    registerRoutes(app: FastifyInstance): void {
      registerCompaniesRoutes(app, routeDeps);
      registerStaffRoutes(app, staffDeps, deps.dataScopes, rulesPass);
    },
    getStaffCaller(staffId: string) {
      return staffCallers.get(makeId<'StaffId'>(staffId));
    },
    isStaffRequestRefused: staffRequestGate,
    runAccountRules: rulesPass,
    pausedCompanyName: async (companyId: string) => {
      const now = deps.clock.now().getTime();
      const cached = pausedNames.get(companyId);
      if (cached !== undefined && cached.until > now) return cached.name;
      const id = makeId<'CompanyId'>(companyId);
      const status = await accountStates.getStatus(id);
      const name =
        status !== null && isPaused(status) ? ((await repo.findById(id))?.name ?? null) : null;
      pausedNames.set(companyId, { name, until: now + 5000 });
      return name;
    },
    async listFleetContacts(companyId: string) {
      const accounts = await deps.dataScopes.run({ kind: 'platform' }, () =>
        staffDeps.accounts.listByCompany(makeId<'CompanyId'>(companyId)),
      );
      return accounts.flatMap((a) =>
        a.kind === 'fleet'
          ? [
              {
                staffId: a.id,
                name: a.name,
                email: a.email,
                privileges: a.privileges,
              },
            ]
          : [],
      );
    },
    async listCompanyNames() {
      const all = await repo.findAll();
      return all.map((c) => ({ id: c.id, name: c.name }));
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
