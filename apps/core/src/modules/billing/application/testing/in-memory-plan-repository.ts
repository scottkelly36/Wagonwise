import type { StaffId } from '../../domain/billing-details.js';
import type { CapacityChange, CompanyId } from '../../domain/plan.js';
import type { PlanRepository } from '../ports/plan-repository.js';

export class InMemoryPlanRepository implements PlanRepository {
  readonly prices = new Map<CompanyId, number>();
  #changes: CapacityChange[] = [];
  /** Who last set a price or a capacity, for tests. */
  lastBy: StaffId | undefined;

  listPrices(): Promise<ReadonlyMap<CompanyId, number>> {
    return Promise.resolve(new Map(this.prices));
  }

  setPrice(companyId: CompanyId, pence: number, by: StaffId, _at?: Date): Promise<void> {
    this.prices.set(companyId, pence);
    this.lastBy = by;
    return Promise.resolve();
  }

  listChanges(companyId: CompanyId): Promise<CapacityChange[]> {
    return Promise.resolve(this.#changes.filter((c) => c.companyId === companyId));
  }

  listAllChanges(): Promise<CapacityChange[]> {
    return Promise.resolve([...this.#changes]);
  }

  setCapacity(change: CapacityChange, by: StaffId, _at?: Date): Promise<void> {
    this.#changes = this.#changes.filter(
      (c) => !(c.companyId === change.companyId && c.effectiveFrom === change.effectiveFrom),
    );
    this.#changes.push(change);
    this.lastBy = by;
    return Promise.resolve();
  }
}
