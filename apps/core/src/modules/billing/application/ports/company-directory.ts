import type { CompanyId } from '../../domain/plan.js';

/** The companies WagonWise bills. Supplied by composition over `companies` (AGENTS.md rule 7). */
export interface CompanyDirectory {
  /** `trialEndsOn` is the last day of the company's free trial, when it has one: it is not billed for a month the trial covers. */
  list(): Promise<
    readonly {
      readonly id: CompanyId;
      readonly name: string;
      readonly trialEndsOn?: string | null | undefined;
    }[]
  >;
}
