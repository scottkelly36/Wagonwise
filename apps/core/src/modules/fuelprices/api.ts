import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { Result } from '../../shared/result.js';
import type { FuelRepository } from './application/fuel-repository.js';
import type { FuelSource } from './application/fuel-source.js';
import {
  refreshFuelPrices,
  type RefreshError,
  type RefreshSummary,
} from './application/refresh-fuel-prices.js';
import type { UntypedDb } from './infrastructure/db.js';
import {
  FuelFinderClient,
  NoFuelSource,
  type FuelFinderCredentials,
} from './infrastructure/fuel-finder-client.js';
import { PostgresFuelRepository } from './infrastructure/postgres-fuel-repository.js';
import { registerFuelRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type { RefreshError, RefreshSummary } from './application/refresh-fuel-prices.js';
export type {
  FuelPosition,
  FuelPrice,
  FuelSnapshot,
  FuelSourceUnavailable,
  FuelStation,
  FuelType,
  SnapshotTooSmall,
} from './domain/fuel.js';
export type { FuelFinderCredentials } from './infrastructure/fuel-finder-client.js';

export interface FuelPricesModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  /** The Fuel Finder credentials. Unset means no fetching (and no requests), so a dev machine with none still boots. */
  readonly credentials?: FuelFinderCredentials | undefined;
  /** Replaces the service; tests pass a fake. */
  readonly source?: FuelSource | undefined;
  /** Replaces the database copy; tests pass a fake. */
  readonly repository?: FuelRepository | undefined;
  /** Told about a fetch that failed for a reason that is ours to fix (a refused sign-in, an outage, a changed format). */
  readonly onProblem?: ((what: string, detail: unknown) => void) | undefined;
}

export interface FuelPricesModule {
  /** Whether Fuel Finder credentials are set. Without them `refresh` does nothing useful and no request is made. */
  readonly enabled: boolean;
  /**
   * Fetches Fuel Finder afresh (about 34 requests, so a job and never a request) and makes the stored copy match it. A failed
   * fetch or an answer that is clearly too small leaves the last good copy in place and comes back as an error value.
   */
  refresh(): Promise<Result<RefreshSummary, RefreshError>>;
  /** `POST /fuel/nearby`: the cheapest stations around a point for one fuel, from the stored copy. */
  registerRoutes(app: FastifyInstance): void;
}

/** `fuelprices`' only public surface (AGENTS.md rule 6): pump prices by station from GOV.UK Fuel Finder, kept as our own copy. */
export function createFuelPricesModule(deps: FuelPricesModuleDeps): FuelPricesModule {
  const source: FuelSource =
    deps.source ??
    (deps.credentials === undefined
      ? new NoFuelSource()
      : new FuelFinderClient(deps.credentials, undefined, deps.onProblem));
  const repo = deps.repository ?? new PostgresFuelRepository(deps.db);
  return {
    enabled: source.enabled,
    refresh: () => refreshFuelPrices({ source, repo, clock: deps.clock }),
    registerRoutes(app) {
      registerFuelRoutes(app, { repo, clock: deps.clock });
    },
  };
}
