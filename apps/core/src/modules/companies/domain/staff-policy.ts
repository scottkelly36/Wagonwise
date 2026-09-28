import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId } from './company.js';
import {
  isPrivilege,
  type Actor,
  type FleetUser,
  type Privilege,
  type StaffAccount,
} from './staff-account.js';

/**
 * The permission rules for staff (P2-M1 decisions, 2026-09-28), as pure functions: no database,
 * no HTTP, so every rule is unit tested on its own. Use cases load what these need (the target
 * account, the company's manager count) and call them before changing anything.
 *
 * - Platform staff (WagonWise admins) can do anything in any company, so WagonWise can step in.
 * - A fleet user acts only inside their own company, and only with the privileges they hold.
 * - A manager (`manage_users`) can only give out or take away privileges they hold themselves.
 * - A company is never left without a manager.
 */

export type Forbidden = TaggedError<'Forbidden'>;
export interface InvalidPrivileges extends TaggedError<'InvalidPrivileges'> {
  readonly reason: 'unknown' | 'duplicate';
  readonly values: readonly string[];
}
export interface PrivilegeNotHeld extends TaggedError<'PrivilegeNotHeld'> {
  readonly privileges: readonly Privilege[];
}
export type LastManager = TaggedError<'LastManager'>;
export type NotAFleetUser = TaggedError<'NotAFleetUser'>;

/** May `actor` use `privilege` in `companyId`? The one question almost every staff route asks. */
export function can(actor: Actor, privilege: Privilege, companyId: CompanyId): boolean {
  if (actor.kind === 'platform') return true;
  return actor.companyId === companyId && actor.privileges.includes(privilege);
}

/** A privilege list from outside the domain: known values only, no repeats. */
export function validatePrivileges(
  values: readonly string[],
): Result<readonly Privilege[], InvalidPrivileges> {
  const unknown = values.filter((v) => !isPrivilege(v));
  if (unknown.length > 0)
    return err({ tag: 'InvalidPrivileges', reason: 'unknown', values: unknown });
  const duplicates = values.filter((v, i) => values.indexOf(v) !== i);
  if (duplicates.length > 0) {
    return err({ tag: 'InvalidPrivileges', reason: 'duplicate', values: [...new Set(duplicates)] });
  }
  return ok(values.filter(isPrivilege));
}

/**
 * The privileges `actor` isn't allowed to hand out or take away: none for platform staff; for a
 * fleet manager, whatever isn't in their own list. Only meaningful once `can(actor,
 * 'manage_users', company)` has passed.
 */
function notHeldBy(actor: Actor, privileges: readonly Privilege[]): Privilege[] {
  if (actor.kind === 'platform') return [];
  return privileges.filter((p) => !actor.privileges.includes(p));
}

/** Inviting someone to `companyId` with `privileges`. Platform staff may invite anyone; a
 *  manager only into their own company, and only with privileges they hold. */
export function checkFleetInvite(
  actor: Actor,
  companyId: CompanyId,
  privileges: readonly Privilege[],
): Result<void, Forbidden | PrivilegeNotHeld> {
  if (!can(actor, 'manage_users', companyId)) return err({ tag: 'Forbidden' });
  const missing = notHeldBy(actor, privileges);
  if (missing.length > 0) return err({ tag: 'PrivilegeNotHeld', privileges: missing });
  return ok(undefined);
}

/** Only WagonWise admins can create other WagonWise admins. */
export function checkPlatformInvite(actor: Actor): Result<void, Forbidden> {
  return actor.kind === 'platform' ? ok(undefined) : err({ tag: 'Forbidden' });
}

function isManager(privileges: readonly Privilege[]): boolean {
  return privileges.includes('manage_users');
}

/**
 * Replacing `target`'s privileges. `managersInCompany` is how many fleet users in the target's
 * company currently hold `manage_users` (the target included, if they do). Returns the updated
 * account; nothing is saved here.
 */
export function setPrivileges(
  actor: Actor,
  target: StaffAccount,
  requested: readonly Privilege[],
  managersInCompany: number,
): Result<FleetUser, Forbidden | NotAFleetUser | PrivilegeNotHeld | LastManager> {
  if (target.kind !== 'fleet') return err({ tag: 'NotAFleetUser' });
  if (!can(actor, 'manage_users', target.companyId)) return err({ tag: 'Forbidden' });

  // Everything being switched on or off must be something the actor holds.
  const added = requested.filter((p) => !target.privileges.includes(p));
  const removed = target.privileges.filter((p) => !requested.includes(p));
  const missing = notHeldBy(actor, [...added, ...removed]);
  if (missing.length > 0) return err({ tag: 'PrivilegeNotHeld', privileges: missing });

  if (isManager(target.privileges) && !isManager(requested) && managersInCompany <= 1) {
    return err({ tag: 'LastManager' });
  }
  return ok({ ...target, privileges: [...requested] });
}

/**
 * Removing `target` from the dashboard. Same rules as taking away all of their privileges: a
 * manager can only remove someone whose privileges they hold, and never the last manager.
 * Platform staff accounts are removed by platform staff only.
 */
export function checkRemoveStaff(
  actor: Actor,
  target: StaffAccount,
  managersInCompany: number,
): Result<void, Forbidden | PrivilegeNotHeld | LastManager> {
  if (target.kind === 'platform') {
    return actor.kind === 'platform' ? ok(undefined) : err({ tag: 'Forbidden' });
  }
  if (!can(actor, 'manage_users', target.companyId)) return err({ tag: 'Forbidden' });
  const missing = notHeldBy(actor, target.privileges);
  if (missing.length > 0) return err({ tag: 'PrivilegeNotHeld', privileges: missing });
  if (isManager(target.privileges) && managersInCompany <= 1) return err({ tag: 'LastManager' });
  return ok(undefined);
}

/** Who can see a company's staff list: anyone who can manage its users. */
export function canViewStaff(actor: Actor, companyId: CompanyId): boolean {
  return can(actor, 'manage_users', companyId);
}
