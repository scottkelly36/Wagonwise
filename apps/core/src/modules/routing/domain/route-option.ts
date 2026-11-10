import type { GeoLine } from './geo.js';
import type { HillStats } from './hill-profile.js';
import type { RouteCharge } from './tolls.js';

/** `gentle` is the route with the least steep road among those found, asked for when the vehicle is loaded. `toll-free` is a route found by asking the
 *  engine to avoid tolls, offered when another option has one. */
export type RouteOptionLabel = 'fastest' | 'shortest' | 'gentle' | 'toll-free';

/** How hilly a route is, in figures a driver can weigh against its time: what the hill check found, rounded. */
export interface HillSummary {
  readonly climbM: number;
  readonly highestPointM: number;
  /** The steepest grade over 500 m, climbing or descending, in percent to one decimal place. */
  readonly steepestPct: number;
  /** The length of road at or above the steep grade, in km to one decimal place, and how many separate stretches it is in. */
  readonly steepKm: number;
  readonly steepStretches: number;
}

export function summariseHills(stats: HillStats): HillSummary {
  return {
    climbM: Math.round(stats.climbM),
    highestPointM: Math.round(stats.highestPointM),
    steepestPct: Math.round(stats.steepestPct * 10) / 10,
    steepKm: Math.round(stats.steepKm * 10) / 10,
    steepStretches: stats.stretches.length,
  };
}

/** One of the alternatives Valhalla's `alternates` request returns, labelled and costed —
 *  unpersisted (M9, docs/progress.md: only the alternative a driver actually picks becomes a
 *  `RoutePlan` row). */
export interface RouteOption {
  readonly geometry: GeoLine;
  readonly distanceKm: number;
  readonly durationMin: number;
  /** A rough estimate, not a quote — see `estimateFuelCostGBP`. Undefined when the vehicle profile
   *  has no `fuelConsumptionL100km` set. */
  readonly estimatedFuelCostGBP?: number | undefined;
  /** Non-empty — a route that's both the fastest and the shortest of the candidates carries both
   *  labels rather than being arbitrarily assigned just one, so the driver isn't shown two
   *  identical-looking cards for what's really a single route. */
  readonly labels: readonly RouteOptionLabel[];
  /** True when no route exists for the vehicle's real weight and this one was found by ignoring weight limits: it goes
   *  past a signed weight limit somewhere. Absent (not false) for an ordinary route. */
  readonly breaksWeightLimit?: boolean | undefined;
  /** Present only when the hills were checked (the vehicle is loaded and the engine has heights). */
  readonly hills?: HillSummary | undefined;
  /** The route has a toll, as far as the map data says. Present only when the engine said either way. */
  readonly hasToll?: boolean | undefined;
  /** The named tolls on the route with what each charges this vehicle (see `chargesOnRoute`). Present only when there is at least one we know; a route
   *  can have a toll that is not named here, which `hasToll` still says. */
  readonly charges?: readonly RouteCharge[] | undefined;
}

interface Candidate {
  readonly geometry: GeoLine;
  readonly distanceKm: number;
  readonly durationMin: number;
  readonly hills?: HillSummary | undefined;
  /** The one found to be the least steep that is not unreasonably long (see `findGentlestRoute`). At most one candidate has it. */
  readonly gentle?: boolean | undefined;
  readonly hasToll?: boolean | undefined;
  readonly charges?: readonly RouteCharge[] | undefined;
  /** The route has no toll because the engine was asked to avoid them (see `findTollFreeRoute`): it gets the `toll-free` label. At most one candidate has it. */
  readonly tollFree?: boolean | undefined;
  /** Found by a search of ours, not one of the engine's own alternatives, so it is neither "fastest" nor "shortest" however short it is. */
  readonly fromSearch?: boolean | undefined;
}

/** `distanceKm × (fuelConsumptionL100km / 100) × pricePerLitreGBP` — deliberately rough (M9's own
 *  scoping): no tolls, no traffic, no live fuel-price feed. Undefined whenever the vehicle's own
 *  consumption figure is undefined, since a driver who hasn't measured it gets no estimate rather
 *  than one built on a guessed number. */
export function estimateFuelCostGBP(
  distanceKm: number,
  fuelConsumptionL100km: number | undefined,
  pricePerLitreGBP: number,
): number | undefined {
  if (fuelConsumptionL100km === undefined) {
    return undefined;
  }
  return distanceKm * (fuelConsumptionL100km / 100) * pricePerLitreGBP;
}

/**
 * Labels Valhalla's primary route plus its alternates as "fastest"/"shortest" and costs each one.
 * Candidates with identical geometry are merged into a single option carrying both labels — a
 * route that's both the fastest and the shortest of what Valhalla returned is one choice, not two
 * indistinguishable cards.
 */
export function buildRouteOptions(
  candidates: readonly Candidate[],
  fuelConsumptionL100km: number | undefined,
  pricePerLitreGBP: number,
): readonly RouteOption[] {
  // A route found by a search of ours (the toll-free one) is not what "fastest" or "shortest" means: planning with those strategies would not make it again.
  const engineRoutes = candidates.filter((c) => c.fromSearch !== true);
  const compared = engineRoutes.length > 0 ? engineRoutes : candidates;
  const fastest = compared.reduce((min, c) => (c.durationMin < min.durationMin ? c : min));
  const shortest = compared.reduce((min, c) => (c.distanceKm < min.distanceKm ? c : min));

  const seen = new Map<string, RouteOptionLabel[]>();
  const order: string[] = [];
  for (const c of candidates) {
    const labels: RouteOptionLabel[] = [];
    if (c.fromSearch !== true && c.geometry === fastest.geometry) labels.push('fastest');
    if (c.fromSearch !== true && c.geometry === shortest.geometry) labels.push('shortest');
    if (c.gentle === true) labels.push('gentle');
    if (c.tollFree === true) labels.push('toll-free');
    if (labels.length === 0) continue;
    if (!seen.has(c.geometry)) {
      order.push(c.geometry);
      seen.set(c.geometry, []);
    }
    const existing = seen.get(c.geometry);
    if (existing) {
      for (const label of labels) {
        if (!existing.includes(label)) existing.push(label);
      }
    }
  }

  return order.map((geometry) => {
    const candidate = candidates.find((c) => c.geometry === geometry);
    if (!candidate) {
      throw new Error('unreachable: geometry came from candidates');
    }
    return {
      geometry: candidate.geometry,
      distanceKm: candidate.distanceKm,
      durationMin: candidate.durationMin,
      estimatedFuelCostGBP: estimateFuelCostGBP(
        candidate.distanceKm,
        fuelConsumptionL100km,
        pricePerLitreGBP,
      ),
      labels: seen.get(geometry) ?? [],
      ...(candidate.hills === undefined ? {} : { hills: candidate.hills }),
      ...(candidate.hasToll === undefined ? {} : { hasToll: candidate.hasToll }),
      ...(candidate.charges === undefined || candidate.charges.length === 0
        ? {}
        : { charges: candidate.charges }),
    };
  });
}
