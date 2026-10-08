import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import { WarningsCache, type WarningSource } from './application/warnings-cache.js';
import { MetOfficeWarningsClient } from './infrastructure/met-office-client.js';
import { registerWeatherRoutes } from './interface/routes.js';

export type { WarningSource } from './application/warnings-cache.js';
export type { WeatherWarning } from './domain/warning.js';

export interface WeatherModuleDeps {
  readonly clock: Clock;
  /** The Met Office Weather DataHub key. Unset means no warnings are fetched and none are shown, so a
   *  dev machine with no key still boots. */
  readonly metOfficeApiKey?: string | undefined;
  /** Replaces the Met Office; tests pass a fake. */
  readonly source?: WarningSource | undefined;
}

export interface WeatherModule {
  registerRoutes(app: FastifyInstance): void;
  /** Fetches the latest warnings; throws if the source fails, leaving the last good set in place. */
  refresh(): Promise<void>;
  readonly enabled: boolean;
}

/** `weather`'s only public surface (AGENTS.md rule 6): Met Office warnings for the driver app's badge
 *  and the dashboard's banner and fleet map. Nothing is stored; see `WarningsCache`. */
export function createWeatherModule(deps: WeatherModuleDeps): WeatherModule {
  const source =
    deps.source ??
    (deps.metOfficeApiKey === undefined
      ? undefined
      : new MetOfficeWarningsClient(deps.metOfficeApiKey));
  const cache = new WarningsCache(source, deps.clock);
  return {
    registerRoutes: (app) => registerWeatherRoutes(app, cache),
    refresh: () => cache.refresh(),
    enabled: cache.enabled,
  };
}
