import { ok, type Result } from '../../../../shared/result.js';
import type {
  NoRouteFound,
  RouteRequest,
  RouteResult,
  RoutingEngine,
} from '../ports/routing-engine.js';

/** Configurable result + a log of every request, so a test can both drive `PlanRoute`'s outcome
 *  and assert what it asked the engine for (e.g. that a profile's dimensions were forwarded). */
export class FakeRoutingEngine implements RoutingEngine {
  result: Result<RouteResult, NoRouteFound> = ok({
    geometry: 'fake-geometry',
    distanceKm: 10,
    durationMin: 15,
  });
  readonly requests: RouteRequest[] = [];

  route(req: RouteRequest): Promise<Result<RouteResult, NoRouteFound>> {
    this.requests.push(req);
    return Promise.resolve(this.result);
  }
}
