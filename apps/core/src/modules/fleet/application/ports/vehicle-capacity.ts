import type { CompanyId } from '../../domain/vehicle.js';

/** How many vehicles a company's plan covers today. Supplied by composition over `billing` (AGENTS.md
 *  rule 7: fleet never imports billing). A company with no plan covers none. */
export interface VehicleCapacity {
  capacityFor(companyId: CompanyId): Promise<number>;
}
