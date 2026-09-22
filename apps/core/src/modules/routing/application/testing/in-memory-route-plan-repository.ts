import type { RoutePlan, RoutePlanId } from '../../domain/route-plan.js';
import type { RoutePlanRepository } from '../ports/route-plan-repository.js';

export class InMemoryRoutePlanRepository implements RoutePlanRepository {
  #byId = new Map<RoutePlanId, RoutePlan>();

  findById(id: RoutePlanId): Promise<RoutePlan | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  save(plan: RoutePlan): Promise<void> {
    this.#byId.set(plan.id, plan);
    return Promise.resolve();
  }
}
