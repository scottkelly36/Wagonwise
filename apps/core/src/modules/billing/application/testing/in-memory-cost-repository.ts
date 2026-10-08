import type { StaffId } from '../../domain/billing-details.js';
import type { Cost, CostCategory, CostId } from '../../domain/finance.js';
import type { MonthString } from '../../domain/invoice.js';
import type { CostRepository } from '../ports/cost-repository.js';

export class InMemoryCostRepository implements CostRepository {
  #costs: Cost[] = [];

  list(): Promise<Cost[]> {
    return Promise.resolve([...this.#costs]);
  }

  findById(id: CostId): Promise<Cost | null> {
    return Promise.resolve(this.#costs.find((c) => c.id === id) ?? null);
  }

  insert(cost: Cost, _by: StaffId, _at: Date): Promise<void> {
    this.#costs.push(cost);
    return Promise.resolve();
  }

  updateFields(
    id: CostId,
    fields: { category: CostCategory; description: string; amountPence: number },
  ): Promise<void> {
    this.#costs = this.#costs.map((c) => (c.id === id ? { ...c, ...fields } : c));
    return Promise.resolve();
  }

  setToMonth(id: CostId, toMonth: MonthString | undefined): Promise<void> {
    this.#costs = this.#costs.map((c) => (c.id === id ? { ...c, toMonth } : c));
    return Promise.resolve();
  }

  delete(id: CostId): Promise<void> {
    this.#costs = this.#costs.filter((c) => c.id !== id);
    return Promise.resolve();
  }
}
