import type { VehicleUse } from '../../domain/invoice.js';
import type { CompanyId } from '../../domain/plan.js';

/**
 * Which of a company's vehicles were used, for the month being billed. Supplied by composition over `jobs` and `checks` (AGENTS.md
 * rule 7): a vehicle was used if it was given a job or had a walk-round check. It reads what was recorded, so a vehicle deleted
 * after it worked still counts for the month it worked in.
 */
export interface VehicleUseHistory {
  /** Every vehicle with any use on record: its first day ever, and whether it was used from `fromDay` up to (not including) `toDay`. */
  usedBetween(companyId: CompanyId, fromDay: string, toDay: string): Promise<readonly VehicleUse[]>;
}
