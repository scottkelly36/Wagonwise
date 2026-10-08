import type { CompanyId } from '../../domain/plan.js';

/** How many vehicles a company has now. Supplied by composition over `fleet` (AGENTS.md rule 7). */
export interface VehicleCount {
  countFor(companyId: CompanyId): Promise<number>;
}
