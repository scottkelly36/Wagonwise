import type { Result } from '../../../shared/result.js';
import type {
  NoRouteFound,
  RouteRequest,
  RouteResult,
  RoutingEngine,
} from './ports/routing-engine.js';

/** Whether any of these routes uses a toll, as far as the engine's map data says. */
export function anyHasToll(routes: readonly Pick<RouteResult, 'hasToll'>[]): boolean {
  return routes.some((route) => route.hasToll === true);
}

/**
 * For a driver whose routes include a toll: the route the engine finds when asked to avoid tolls, or `undefined` when there is no point offering one.
 * That is when none of `routes` has a toll, when the engine finds no route, and when the route it finds still has a toll (it avoids tolls only when
 * it can, and a journey that needs one has no toll-free way, so nothing is offered).
 */
export async function findTollFreeRoute(
  engine: Pick<RoutingEngine, 'route'>,
  request: RouteRequest,
  routes: readonly Pick<RouteResult, 'hasToll'>[],
): Promise<RouteResult | undefined> {
  if (!anyHasToll(routes)) return undefined;
  const found: Result<RouteResult, NoRouteFound> = await engine.route({
    ...request,
    avoidTolls: true,
  });
  if (!found.ok || found.value.hasToll === true) return undefined;
  return found.value;
}
