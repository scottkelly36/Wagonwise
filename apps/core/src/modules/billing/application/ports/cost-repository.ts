import type { StaffId } from '../../domain/billing-details.js';
import type { Cost, CostCategory, CostId } from '../../domain/finance.js';
import type { MonthString } from '../../domain/invoice.js';

export interface CostRepository {
  /** Every cost WagonWise carries, past, standing and one-off, in the order they began. */
  list(): Promise<Cost[]>;
  findById(id: CostId): Promise<Cost | null>;
  insert(cost: Cost, by: StaffId, at: Date): Promise<void>;
  /** Changes what the row says; its months are not touched. */
  updateFields(
    id: CostId,
    fields: { category: CostCategory; description: string; amountPence: number },
  ): Promise<void>;
  /** Sets the last month it applies to, or `undefined` to let it carry on. */
  setToMonth(id: CostId, toMonth: MonthString | undefined): Promise<void>;
  delete(id: CostId): Promise<void>;
}
