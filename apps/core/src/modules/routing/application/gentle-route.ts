import { atOffset, avoidZonesAlongStretch } from '../domain/closure-avoid-zones.js';
import { indexRoute } from '../domain/closure-on-route.js';
import { decodePolyline, type GeoPoint, type GeoPolygon } from '../domain/geo.js';
import { hillStats, type HillStats } from '../domain/hill-profile.js';
import type { RouteRequest, RouteResult, RoutingEngine } from './ports/routing-engine.js';

/** A route and how hilly it is, with the avoid zones that were put on the steep stretches of earlier routes to find it (none for one
 *  the engine chose by itself). The zones are kept so a later pass for the same trip can keep off the same roads. */
export interface ScoredRoute {
  readonly route: RouteResult;
  readonly stats: HillStats;
  readonly hillZones: readonly GeoPolygon[];
}

export interface GentleSearch {
  /** Every route looked at, the engine's own first. */
  readonly candidates: readonly ScoredRoute[];
  /** The cheapest for a loaded lorry (time plus a cost for steep road) of those not unreasonably longer than the quickest. */
  readonly gentlest: ScoredRoute;
}

/** Times the steep stretches of the best route so far are avoided and the route made again. Each is a full routing request and a height request. */
const MAX_HILL_REPLANS = 5;

/** The stretches picked to avoid on each round, steepest and longest first. */
const STRETCHES_PER_ROUND = 1;

/** Avoid zones for hills in all. A zone is 32 m round, Valhalla refuses a request with more than 10 km of zone edge, and hazards and
 *  closures need room as well. */
const MAX_HILL_ZONES = 60;

/** A route with no more than this of steep road is gentle enough: the search stops, and it is not worth a detour to remove the last bit. */
const TOLERABLE_STEEP_KM = 1.5;

/** What a kilometre of steep road is worth to a loaded lorry, in minutes: it is slow up it, and slow and careful down it. Routes are
 *  compared on their time plus this for each steep kilometre, so a route is only called gentler when what it saves in hills is worth the
 *  extra driving. The second number to tune on real routes, after the grade that counts as steep. */
export const STEEP_KM_COST_MIN = 8;

/** A gentler route is only offered as "the gentlest" if it takes no more than this times as long as the quickest, plus a margin of
 *  this many minutes for a short trip. A driver can still see the quickest; this stops a loop round half of Britain being called gentle. */
const MAX_TIME_FACTOR = 1.5;
const TIME_MARGIN_MIN = 15;

async function scoreRoute(
  engine: RoutingEngine,
  route: RouteResult,
  hillZones: readonly GeoPolygon[],
): Promise<ScoredRoute | undefined> {
  const profile = await engine.elevationProfile(route.geometry);
  if (profile === undefined) return undefined;
  return { route, stats: hillStats(profile), hillZones };
}

/** The time a loaded lorry should expect on a route: its driving time plus {@link STEEP_KM_COST_MIN} for each steep kilometre. */
function loadedCostMin(route: ScoredRoute): number {
  return route.route.durationMin + STEEP_KM_COST_MIN * route.stats.steepKm;
}

/** The route that costs a loaded lorry the least, among those not unreasonably long: the quickest when no other saves enough in hills. */
function pickGentlest(candidates: readonly ScoredRoute[]): ScoredRoute {
  const quickest = candidates.reduce((min, c) =>
    c.route.durationMin < min.route.durationMin ? c : min,
  );
  const limit = quickest.route.durationMin * MAX_TIME_FACTOR + TIME_MARGIN_MIN;
  const reasonable = candidates.filter((c) => c.route.durationMin <= limit);
  return reasonable.reduce((best, c) => {
    if (loadedCostMin(c) !== loadedCostMin(best))
      return loadedCostMin(c) < loadedCostMin(best) ? c : best;
    return c.route.durationMin < best.route.durationMin ? c : best;
  });
}

/** A stretch is "shared" when every other route passes within this far of its middle: the start and the end of a trip are the same for every
 *  route, and a zone there would shut every road. */
const SHARED_WITHIN_M = 150;

const METRES_PER_DEGREE_LAT = 111_320;

function passesNear(route: ScoredRoute, point: GeoPoint): boolean {
  const perDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((point.lat * Math.PI) / 180);
  for (const p of decodePolyline(route.route.geometry)) {
    const dx = (p.lon - point.lon) * perDegreeLon;
    const dy = (p.lat - point.lat) * METRES_PER_DEGREE_LAT;
    if (Math.hypot(dx, dy) <= SHARED_WITHIN_M) return true;
  }
  return false;
}

/**
 * Zones along the worst stretches of a route that another route avoids: the steepest and longest first, no more than `maxZones`. A stretch
 * every other route also uses cannot be steered round, so it is left alone, or the zones would leave no route at all.
 */
function zonesForSteepStretches(
  scored: ScoredRoute,
  others: readonly ScoredRoute[],
  maxZones: number,
): GeoPolygon[] {
  const line = indexRoute(decodePolyline(scored.route.geometry));
  const avoidable = scored.stats.stretches.filter((stretch) => {
    if (others.length === 0) return true;
    const { point } = atOffset(line, (stretch.fromM + stretch.toM) / 2);
    return !others.every((other) => passesNear(other, point));
  });
  const worst = [...avoidable]
    .sort((a, b) => b.gradePct * (b.toM - b.fromM) - a.gradePct * (a.toM - a.fromM))
    .slice(0, STRETCHES_PER_ROUND);
  const zones: GeoPolygon[] = [];
  for (const stretch of worst) {
    zones.push(
      ...avoidZonesAlongStretch(line, stretch.fromM, stretch.toM, maxZones - zones.length),
    );
  }
  return zones;
}

/**
 * For a loaded vehicle: of the routes the engine offers, which is the least steep, and can a gentler one be found? The engine has no
 * cost for hills (Valhalla's truck costing has none), so this works from outside it: measure each route with the height service, and
 * while the best has steep stretches, put thin avoid zones on the worst of them and ask for the route again, as is done for closed
 * roads. Stops when a route has little steep road, when a new route is no better, or after {@link MAX_HILL_REPLANS} rounds.
 *
 * Returns `undefined` when the engine has no heights: the caller carries on exactly as for an empty vehicle.
 */
export async function findGentlestRoute(
  engine: RoutingEngine,
  request: RouteRequest,
  firstRoutes: readonly RouteResult[],
): Promise<GentleSearch | undefined> {
  const scored = await Promise.all(firstRoutes.map((route) => scoreRoute(engine, route, [])));
  const candidates: ScoredRoute[] = [];
  for (const s of scored) {
    if (s === undefined) return undefined;
    candidates.push(s);
  }
  if (candidates.length === 0) return undefined;

  let hillZones: GeoPolygon[] = [];
  const zoned = new Set<string>();
  for (let round = 0; round < MAX_HILL_REPLANS; round++) {
    const best = pickGentlest(candidates);
    if (best.stats.steepKm <= TOLERABLE_STEEP_KM || hillZones.length >= MAX_HILL_ZONES) break;
    // The route to steer round next: the least steep one not yet steered round. Often the engine answers a zone on the quickest road
    // with the next road along, which is already a candidate and no better, so the next round steers round that one too.
    const unzoned = candidates.filter((c) => !zoned.has(c.route.geometry));
    if (unzoned.length === 0) break;
    const target = pickGentlest(unzoned);
    zoned.add(target.route.geometry);
    const more = zonesForSteepStretches(
      target,
      candidates.filter((c) => c !== target),
      MAX_HILL_ZONES - hillZones.length,
    );
    if (more.length === 0) continue;
    hillZones = [...hillZones, ...more];

    const next = await engine.route({ ...request, avoid: [...request.avoid, ...hillZones] });
    if (!next.ok) break;
    if (candidates.some((c) => c.route.geometry === next.value.geometry)) continue;
    const nextScored = await scoreRoute(engine, next.value, hillZones);
    if (nextScored === undefined) break;
    candidates.push(nextScored);
  }
  const best = pickGentlest(candidates);
  return { candidates, gentlest: best };
}
