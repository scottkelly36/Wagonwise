import type { CompanyId } from '../../domain/plan.js';

/** The companies WagonWise bills. Supplied by composition over `companies` (AGENTS.md rule 7). */
export interface CompanyDirectory {
  list(): Promise<readonly { readonly id: CompanyId; readonly name: string }[]>;
}
