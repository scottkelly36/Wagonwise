import type { RoutePlan, RoutePlanId } from '../../domain/route-plan.js';

export interface RoutePlanRepository {
  findById(id: RoutePlanId): Promise<RoutePlan | null>;
  /** Insert-only — a `RoutePlan` is immutable (decision 10, docs/progress.md). */
  save(plan: RoutePlan): Promise<void>;
}
