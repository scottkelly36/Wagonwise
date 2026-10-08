import type { StaffId } from '../../domain/billing-details.js';

/** Who a signed-in staff account is, as far as billing cares: only whether it is WagonWise's own. */
export type StaffCaller =
  | { readonly kind: 'platform' }
  | {
      readonly kind: 'fleet';
      readonly companyId: string;
      readonly privileges: readonly string[];
    };

export interface CallerDirectory {
  /** `null` for an unknown or removed account. */
  getCaller(staffId: StaffId): Promise<StaffCaller | null>;
}
