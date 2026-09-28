import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId } from '../domain/company.js';
import type {
  Actor,
  FleetUser,
  Privilege,
  StaffAccount,
  StaffId,
} from '../domain/staff-account.js';
import {
  canViewStaff,
  checkRemoveStaff,
  setPrivileges,
  type Forbidden,
  type LastManager,
  type NotAFleetUser,
  type PrivilegeNotHeld,
} from '../domain/staff-policy.js';
import type { StaffDeps } from './staff-deps.js';

export type StaffNotFound = TaggedError<'StaffNotFound'>;

/** Replaces someone's privileges, within the P2-M1.2 rules. */
export async function setStaffPrivileges(
  deps: Pick<StaffDeps, 'accounts'>,
  actor: Actor,
  input: { readonly staffId: StaffId; readonly privileges: readonly Privilege[] },
): Promise<
  Result<FleetUser, StaffNotFound | Forbidden | NotAFleetUser | PrivilegeNotHeld | LastManager>
> {
  const target = await deps.accounts.findById(input.staffId);
  if (!target) return err({ tag: 'StaffNotFound' });
  const managers =
    target.kind === 'fleet' ? await deps.accounts.countManagers(target.companyId) : 0;
  const updated = setPrivileges(actor, target, input.privileges, managers);
  if (!updated.ok) return updated;
  await deps.accounts.save(updated.value);
  return ok(updated.value);
}

/** Removes someone from the dashboard and signs them out everywhere at once. */
export async function removeStaff(
  deps: Pick<StaffDeps, 'accounts' | 'sessions' | 'clock'>,
  actor: Actor,
  input: { readonly staffId: StaffId },
): Promise<Result<void, StaffNotFound | Forbidden | PrivilegeNotHeld | LastManager>> {
  const target = await deps.accounts.findById(input.staffId);
  if (!target) return err({ tag: 'StaffNotFound' });
  const managers =
    target.kind === 'fleet' ? await deps.accounts.countManagers(target.companyId) : 0;
  const allowed = checkRemoveStaff(actor, target, managers);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  await deps.accounts.remove(target.id, now);
  await deps.sessions.revokeAllForStaff(target.id, now);
  return ok(undefined);
}

/**
 * A company's staff for its managers, or with no company given, everyone (WagonWise admins
 * only). Fleet users can't list across companies.
 */
export async function listStaff(
  deps: Pick<StaffDeps, 'accounts'>,
  actor: Actor,
  input: { readonly companyId?: CompanyId | undefined },
): Promise<Result<StaffAccount[], Forbidden>> {
  if (input.companyId === undefined) {
    if (actor.kind !== 'platform') return err({ tag: 'Forbidden' });
    return ok(await deps.accounts.listAll());
  }
  if (!canViewStaff(actor, input.companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.accounts.listByCompany(input.companyId));
}
