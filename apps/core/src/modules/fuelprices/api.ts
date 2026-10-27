import type { Result } from '../../shared/result.js';
import type { FuelSource } from './application/fuel-source.js';
import { loadFuelSnapshot } from './application/load-snapshot.js';
import type { FuelSnapshot, FuelSourceUnavailable } from './domain/fuel.js';
import {
  FuelFinderClient,
  NoFuelSource,
  type FuelFinderCredentials,
} from './infrastructure/fuel-finder-client.js';

export type {
  FuelPosition,
  FuelPrice,
  FuelSnapshot,
  FuelSourceUnavailable,
  FuelStation,
  FuelType,
} from './domain/fuel.js';
export type { FuelFinderCredentials } from './infrastructure/fuel-finder-client.js';

export interface FuelPricesModuleDeps {
  /** The Fuel Finder credentials. Unset means no fetching (and no requests), so a dev machine with none still boots. */
  readonly credentials?: FuelFinderCredentials | undefined;
  /** Replaces the service; tests pass a fake. */
  readonly source?: FuelSource | undefined;
  /** Told about a fetch that failed for a reason that is ours to fix (a refused sign-in, an outage, a changed format). */
  readonly onProblem?: ((what: string, detail: unknown) => void) | undefined;
}

export interface FuelPricesModule {
  readonly enabled: boolean;
  /** Every station and its newest prices, fetched fresh from the government's Fuel Finder (about 34 requests, so a job, not a request). */
  loadSnapshot(): Promise<Result<FuelSnapshot, FuelSourceUnavailable>>;
}

/** `fuelprices`' only public surface (AGENTS.md rule 6): pump prices by station from GOV.UK Fuel Finder. Nothing is stored yet. */
export function createFuelPricesModule(deps: FuelPricesModuleDeps): FuelPricesModule {
  const source: FuelSource =
    deps.source ??
    (deps.credentials === undefined
      ? new NoFuelSource()
      : new FuelFinderClient(deps.credentials, undefined, deps.onProblem));
  return {
    enabled: source.enabled,
    loadSnapshot: () => loadFuelSnapshot(source),
  };
}
