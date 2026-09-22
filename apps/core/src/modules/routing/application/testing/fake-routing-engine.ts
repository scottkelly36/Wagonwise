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

  route(req: RouteRequest): Promise<Result<RouteResult, NoRouteFound>> {
    this.requests.push(req);
    return Promise.resolve(this.results.shift() ?? this.result);
  }
}
