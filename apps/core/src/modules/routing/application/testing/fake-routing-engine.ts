import { ok, type Result } from '../../../../shared/result.js';
import type {
  NoRouteFound,
  RouteRequest,
  RouteResult,
  RoutingEngine,
} from '../ports/routing-engine.js';

/** Configurable result + a log of every request, so a test can both drive `PlanRoute`'s outcome
 *  and assert what it asked the engine for (e.g. that a profile's dimensions were forwarded).
 *  `results` is an optional per-call queue (consumed in order) for tests that need the first and
 *  second call in a two-pass plan — M3.5's reroute-around-a-blocking-hazard flow — to differ;
 *  `result` alone still answers every call once the queue is empty, so every test written before
 *  `results` existed keeps working unchanged. */
export class FakeRoutingEngine implements RoutingEngine {
  result: Result<RouteResult, NoRouteFound> = ok({
    geometry: 'fake-geometry',
    distanceKm: 10,
    durationMin: 15,
  });
  results: Result<RouteResult, NoRouteFound>[] = [];
  readonly requests: RouteRequest[] = [];

  /** Same shape as `result`/`results` above, for `routeAlternatives` (M9) — a separate queue since
   *  a test may exercise both methods in one plan (`planRoute`'s `strategy: 'shortest'` path calls
   *  `routeAlternatives` first, then `route` again for the hazard-avoidance pass). */
  alternativesResult: Result<readonly RouteResult[], NoRouteFound> = ok([
    { geometry: 'fake-geometry', distanceKm: 10, durationMin: 15 },
  ]);
  alternativesResults: Result<readonly RouteResult[], NoRouteFound>[] = [];
  readonly alternativesRequests: RouteRequest[] = [];

  route(req: RouteRequest): Promise<Result<RouteResult, NoRouteFound>> {
    this.requests.push(req);
    return Promise.resolve(this.results.shift() ?? this.result);
  }

  routeAlternatives(req: RouteRequest): Promise<Result<readonly RouteResult[], NoRouteFound>> {
    this.alternativesRequests.push(req);
    return Promise.resolve(this.alternativesResults.shift() ?? this.alternativesResult);
  }
}
