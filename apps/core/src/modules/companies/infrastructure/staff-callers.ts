import type { DataScopes } from '../../../shared/ports/data-scope.js';
import type { AdminDirectory } from '../application/ports/admin-directory.js';
import type { StaffAccountRepository } from '../application/ports/staff-account-repository.js';
import type { CompanyId } from '../domain/company.js';
import type { Privilege, StaffId } from '../domain/staff-account.js';

/** What another module needs to know about a signed-in staff member to decide what they may do
 *  (P2-M1.12c). Removed accounts read as `null`. */
export type StaffCallerView =
  | { readonly kind: 'platform'; readonly staffId: StaffId }
  | {
      readonly kind: 'fleet';
      readonly staffId: StaffId;
      readonly companyId: CompanyId;
      readonly privileges: readonly Privilege[];
    };

/**
 * Looks staff members up for the admin checks, in the `staff-auth` scope: at this point nobody's
 * company is known yet, the same reason the staff routes load the account that way. Must be
 * called outside any other `DataScopes.run` (scopes don't nest).
 */
export class StaffCallers implements AdminDirectory {
  constructor(
    private readonly accounts: Pick<StaffAccountRepository, 'findById'>,
    private readonly scopes: DataScopes,
  ) {}

  async get(staffId: StaffId): Promise<StaffCallerView | null> {
    const account = await this.scopes.run({ kind: 'staff-auth' }, () =>
      this.accounts.findById(staffId),
    );
    if (account === null) return null;
    return account.kind === 'platform'
      ? { kind: 'platform', staffId: account.id }
      : {
          kind: 'fleet',
          staffId: account.id,
          companyId: account.companyId,
          privileges: account.privileges,
        };
  }

  async isAdmin(staffId: StaffId): Promise<boolean> {
    return (await this.get(staffId))?.kind === 'platform';
  }
}
