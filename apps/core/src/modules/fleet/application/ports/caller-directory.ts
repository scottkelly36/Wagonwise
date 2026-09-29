import type { CompanyId, StaffId } from '../../domain/vehicle.js';

/**
 * Who's calling, as far as fleet's permission checks care (P2-M1.12c: a signed-in staff account,
 * replacing the driver admin flag and scopes). Fleet owns this port with its own types
 * (AGENTS.md rule 7); composition supplies it over `companies`' `getStaffCaller`.
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
