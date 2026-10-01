import type { CompanyId, StaffId } from '../../domain/job.js';

/**
 * Who's calling, as far as jobs' permission checks care — same shape as fleet's own
 * `CallerDirectory` (AGENTS.md rule 7: jobs owns its own types; composition supplies it over
 * `companies`' `getStaffCaller`).
 */
export type Caller =
  | { readonly kind: 'platform' }
  | {
      readonly kind: 'fleet';
      readonly companyId: CompanyId;
      readonly privileges: readonly string[];
    };

export interface CallerDirectory {
  /** `null` for an unknown or removed account. */
  getCaller(staffId: StaffId): Promise<Caller | null>;
}
