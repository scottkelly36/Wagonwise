import type { GeoPoint } from '../../domain/geo.js';
import type { RoutePlan, RoutePlanId } from '../../domain/route-plan.js';

export interface RoutePlanRepository {
  findById(id: RoutePlanId): Promise<RoutePlan | null>;
  /** Insert-only — a `RoutePlan` is immutable (decision 10, docs/progress.md). */
  save(plan: RoutePlan): Promise<void>;
  /** Plans created since `since` that have never had a trip started from them, whose route
   *  passes within `radiusM` of `location` — design doc §6 step 1's "RoutePlans created in the
   *  last 6 hours that haven't started a trip." The other half of the same query (`ActiveTrip`s
   *  in progress) is `ActiveTripRepository.findActiveNear`, not this method — a plan that *has*
   *  a trip is that method's job once the trip starts, not this one's, regardless of when the
   *  plan itself was created (M6.4). */
  findRecentUnstartedNear(location: GeoPoint, radiusM: number, since: Date): Promise<RoutePlan[]>;
}
