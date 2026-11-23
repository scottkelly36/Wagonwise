import type { Clock } from '../../../shared/ports/clock.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  isOpenWhenPaused,
  refusesStaffRequest,
  type AccountStatus,
} from '../domain/account-state.js';
import type { CompanyId } from '../domain/company.js';
import { makeId } from '../../../shared/brand.js';
import type { StaffId } from '../domain/staff-account.js';
import type { AccountStateRepository } from './ports/account-state-repository.js';

/** Who a signed-in staff member is, as far as this check needs: WagonWise staff are never held back. */
export type GateCaller =
  { readonly kind: 'platform' } | { readonly kind: 'fleet'; readonly companyId: CompanyId };

export interface StaffRequestGateDeps {
  readonly callers: { get(staffId: StaffId): Promise<GateCaller | null> };
  readonly states: Pick<AccountStateRepository, 'getStatus'>;
  readonly scopes: DataScopes;
  readonly clock: Clock;
  /** How long a company's state is remembered, so a burst of changes costs one lookup. A move to or from paused takes effect
   *  within this time. Default 5 seconds. */
  readonly cacheMs?: number;
}

export type StaffRequestGate = (staffId: string, method: string, path: string) => Promise<boolean>;

/**
 * The one check every `/staff/*` request passes (`host/staff-auth.ts` calls it): is this request refused because the staff member's
 * company is paused? True means refuse it with `account_paused`.
 *
 * Reads and the few requests a paused company may still make (`isOpenWhenPaused`) cost nothing: they are let through before any
 * lookup. For anything else, a fleet user's company is looked up (WagonWise staff are never refused), and the answer is the pure
 * rule `refusesStaffRequest`. A company that cannot be found is not refused here: the route answers for itself.
 */
export function createStaffRequestGate(deps: StaffRequestGateDeps): StaffRequestGate {
  const cacheMs = deps.cacheMs ?? 5000;
  const cache = new Map<
    string,
    { readonly status: AccountStatus | null; readonly until: number }
  >();

  async function statusOf(companyId: CompanyId): Promise<AccountStatus | null> {
    const now = deps.clock.now().getTime();
    const cached = cache.get(companyId);
    if (cached !== undefined && cached.until > now) return cached.status;
    const status = await deps.scopes.run({ kind: 'staff-auth' }, () =>
      deps.states.getStatus(companyId),
    );
    cache.set(companyId, { status, until: now + cacheMs });
    return status;
  }

  return async (staffId, method, path) => {
    if (isOpenWhenPaused(method, path)) return false;
    const caller = await deps.callers.get(makeId<'StaffId'>(staffId));
    if (caller === null || caller.kind === 'platform') return false;
    const status = await statusOf(caller.companyId);
    return status !== null && refusesStaffRequest(status, method, path);
  };
}
