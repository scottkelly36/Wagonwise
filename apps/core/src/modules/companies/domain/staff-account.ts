import type { Id } from '../../../shared/brand.js';
import type { CompanyId } from './company.js';

export type StaffId = Id<'StaffId'>;

/**
 * The fixed list of switches a fleet user can have (P2-M1 decision, 2026-09-28). Declared here
 * rather than imported from `packages/contracts` because the domain has no dependencies (AGENTS.md
 * rule 2); the two lists must match, and a test at the interface boundary checks they do.
 */
export const PRIVILEGES = [
  'manage_users',
  'manage_fleet',
  'dispatch',
  'view_live_map',
  'view_reports',
  'manage_billing',
] as const;
export type Privilege = (typeof PRIVILEGES)[number];

export type SecondFactorMethod = 'totp' | 'sms' | 'email';

/**
 * A dashboard user. `platform` staff work for WagonWise and can act in every company; `fleet`
 * users work for one company and can only do what their privileges allow there. Never a driver:
 * the two account types stay separate even when it's the same person.
 */
export type StaffAccount = PlatformStaff | FleetUser;

interface StaffAccountBase {
  readonly id: StaffId;
  readonly email: string;
  readonly name: string;
  readonly secondFactorMethod: SecondFactorMethod;
  readonly createdAt: Date;
}

export interface PlatformStaff extends StaffAccountBase {
  readonly kind: 'platform';
}

export interface FleetUser extends StaffAccountBase {
  readonly kind: 'fleet';
  readonly companyId: CompanyId;
  readonly privileges: readonly Privilege[];
}

/**
 * Who is asking, as far as a permission check is concerned: built from a verified staff token,
 * never from anything the client sends. Every staff use case takes one.
 */
export type Actor =
  | { readonly kind: 'platform'; readonly staffId: StaffId }
  | {
      readonly kind: 'fleet';
      readonly staffId: StaffId;
      readonly companyId: CompanyId;
      readonly privileges: readonly Privilege[];
    };

export function actorFor(account: StaffAccount): Actor {
  return account.kind === 'platform'
    ? { kind: 'platform', staffId: account.id }
    : {
        kind: 'fleet',
        staffId: account.id,
        companyId: account.companyId,
        privileges: account.privileges,
      };
}

export function isPrivilege(value: string): value is Privilege {
  return (PRIVILEGES as readonly string[]).includes(value);
}
