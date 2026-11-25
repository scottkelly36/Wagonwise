import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type {
  CallerDirectory,
  FirmStarter,
  InvitePorts,
  SignupNotifier,
} from './application/signups.js';
import { CryptoTrialTokens } from './infrastructure/crypto-trial-tokens.js';
import {
  PostgresTesterRepository,
  type UntypedDb,
} from './infrastructure/postgres-tester-repository.js';
import { registerSignupRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/postgres-tester-repository.js';
export type {
  CallerDirectory,
  FirmStarter,
  InvitePorts,
  SignupNotifier,
  StaffCaller,
} from './application/signups.js';

export interface SignupsModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** A fresh invite code and the email sender, for the Testers page's "send invite". Supplied by composition over `identity`. */
  readonly invites: InvitePorts;
  /** Makes a company on a free trial and invites its first admin, for the Testers page's "start a trial". Supplied by composition over `companies`. */
  readonly firms: FirmStarter;
  /** The owner's line and the thank-you to a firm that registers. Supplied by composition; undefined sends neither. */
  readonly notify?: SignupNotifier | undefined;
}

export interface SignupsModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `signups`' only public surface (AGENTS.md rule 6): the landing page's "register to test" list. Not accounts, just an
 * address and a few words about who is asking, with their agreement to be contacted.
 */
export function createSignupsModule(deps: SignupsModuleDeps): SignupsModule {
  const testers = new PostgresTesterRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerSignupRoutes(app, {
        signups: {
          testers,
          ids: deps.ids,
          clock: deps.clock,
          notify: deps.notify,
          tokens: new CryptoTrialTokens(),
        },
        invites: deps.invites,
        firms: deps.firms,
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
