import { decodePolyline, type GeoPoint } from '../../domain/geo.js';
import type { RoutePlan, RoutePlanId } from '../../domain/route-plan.js';
import type { RoutePlanRepository } from '../ports/route-plan-repository.js';

/** Flat-earth distance, good enough for a fake used only in unit tests — same reasoning as
 *  hazards' own `InMemoryHazardRepository` (M3). */
function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const METRES_PER_DEGREE_LAT = 111_320;
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export class InMemoryRoutePlanRepository implements RoutePlanRepository {
  #byId = new Map<RoutePlanId, RoutePlan>();
  /** Which plans a fake trip has started from — set directly by a test (`repo.startedPlanIds.add(id)`),
   *  not by `InMemoryActiveTripRepository`: the two fakes deliberately don't reference each other
   *  (no import cycle between test doubles for what's ultimately a corner case the real
   *  cross-table query is what actually proves, in `postgres-route-plan-repository.test.ts`). */
  readonly startedPlanIds = new Set<RoutePlanId>();

  findById(id: RoutePlanId): Promise<RoutePlan | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  save(plan: RoutePlan): Promise<void> {
    this.#byId.set(plan.id, plan);
    return Promise.resolve();
  }

  /** Approximates "near the route" as "near any one of its decoded points" — same shape as
   *  hazards' own `findNearbyLine` fake; the real query (`PostgresRoutePlanRepository`) uses
   *  PostGIS's actual `ST_DWithin` against a stored geography column. */
  findRecentUnstartedNear(location: GeoPoint, radiusM: number, since: Date): Promise<RoutePlan[]> {
    const matches = [...this.#byId.values()].filter((plan) => {
      if (plan.createdAt.getTime() < since.getTime()) return false;
      if (this.startedPlanIds.has(plan.id)) return false;
      const points = decodePolyline(plan.geometry);
      return points.some((p) => metresBetween(p, location) <= radiusM);
    });
    return Promise.resolve(matches);
  }
}
