import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import {
  eraseDriverReferrals,
  type CallerDirectory,
  type DriverLabels,
  type ReferralDeps,
} from './application/referrals.js';
import {
  PostgresReferralCodes,
  PostgresReferrals,
  type UntypedDb,
} from './infrastructure/postgres-referrals.js';
import { registerReferralRoutes } from './interface/routes.js';

export type { UntypedDb } from './infrastructure/postgres-referrals.js';
export type { CallerDirectory, DriverLabels, StaffCaller } from './application/referrals.js';

export interface ReferralsModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** A driver's name or sign-in, for the staff list. Supplied by composition over `identity`. */
  readonly driverLabels: DriverLabels;
  /** Numbers in [0, 1) for the codes; replaced in tests. */
  readonly random?: () => number;
}

export interface ReferralsModule {
  registerRoutes(app: FastifyInstance): void;
  /** Removes a deleted account's code and referrals. Safe to run twice. */
  eraseDriverData(driverId: string): Promise<void>;
}

/** `referrals`' only public surface (AGENTS.md rule 6): drivers recommending WagonWise to the firm they drive for. */
export function createReferralsModule(deps: ReferralsModuleDeps): ReferralsModule {
  const referralDeps: ReferralDeps = {
    codes: new PostgresReferralCodes(deps.db),
    referrals: new PostgresReferrals(deps.db),
    ids: deps.ids,
    clock: deps.clock,
    // Codes are handed to other people, so not Math.random: a guessable code could claim another driver's referral on the phone.
    random: deps.random ?? (() => randomInt(0, 1_000_000) / 1_000_000),
  };
  return {
    eraseDriverData: (driverId) => eraseDriverReferrals(referralDeps, driverId),
    registerRoutes(app) {
      registerReferralRoutes(app, {
        referrals: referralDeps,
        callerDirectory: deps.callers,
        driverLabels: deps.driverLabels,
      });
    },
  };
}
