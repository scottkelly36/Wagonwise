import type { StaffId } from '../../domain/billing-details.js';
import type { CapacityChange, CompanyId } from '../../domain/plan.js';

export interface PlanRepository {
  /** Every company's price per vehicle, in pence; a company with no plan row is simply absent. */
  listPrices(): Promise<ReadonlyMap<CompanyId, number>>;
  setPrice(companyId: CompanyId, pence: number, by: StaffId, at: Date): Promise<void>;
  listChanges(companyId: CompanyId): Promise<CapacityChange[]>;
  listAllChanges(): Promise<CapacityChange[]>;
  /** Replaces any change already set for the same company and day. */
  setCapacity(change: CapacityChange, by: StaffId, at: Date): Promise<void>;
}
