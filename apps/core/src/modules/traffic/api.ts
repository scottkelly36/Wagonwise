import type { Clock } from '../../shared/ports/clock.js';
import type { TrafficProvider } from './application/traffic-provider.js';
import { TrafficService, type RouteTraffic } from './application/traffic-service.js';
import { TomTomTrafficClient } from './infrastructure/tomtom-client.js';

export type { TrafficProvider } from './application/traffic-provider.js';
export type { RouteTraffic } from './application/traffic-service.js';
export type { FlowReading, TrafficIncident } from './domain/traffic.js';

export interface TrafficModuleDeps {
  readonly clock: Clock;
  /** The TomTom key. Unset means no live traffic and every route reports zero delay with zero coverage,
   *  so a dev machine with no key still boots. */
  readonly tomtomApiKey?: string | undefined;
  /** Replaces TomTom; tests pass a fake. */
  readonly provider?: TrafficProvider | undefined;
  readonly dailyRequestLimit: number;
  readonly cacheTtlMs: number;
}

export interface TrafficModule {
  readonly enabled: boolean;
  /** How much slower traffic makes a route (a line of points), and the incidents beside it. */
  delayAlong(line: readonly { lat: number; lon: number }[]): Promise<RouteTraffic>;
  /** Provider calls made today (UTC), for the log. */
  readonly requestsToday: number;
}

/** `traffic`'s only public surface (AGENTS.md rule 6): live flow and incidents from a provider, cached and
 *  capped to the provider's allowance. Stores nothing and sends the provider only grid-snapped points and
 *  boxes, never a route or a driver. Phase-3 routing is the consumer. */
export function createTrafficModule(deps: TrafficModuleDeps): TrafficModule {
  const provider =
    deps.provider ??
    (deps.tomtomApiKey === undefined ? undefined : new TomTomTrafficClient(deps.tomtomApiKey));
  const service = new TrafficService(provider, deps.clock, {
    cacheTtlMs: deps.cacheTtlMs,
    dailyRequestLimit: deps.dailyRequestLimit,
    sampleSpacingM: 5_000,
    maxSamplesPerRoute: 30,
  });
  return {
    enabled: service.enabled,
    delayAlong: (line) => service.delayAlong(line),
    get requestsToday() {
      return service.requestsToday;
    },
  };
}
