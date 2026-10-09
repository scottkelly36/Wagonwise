import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type TesterId = Id<'TesterId'>;

export const ROLES = ['driver', 'company', 'both', 'other'] as const;
export type Role = (typeof ROLES)[number];
export const FLEET_SIZES = ['1-5', '6-15', '16-40', '40+'] as const;
export type FleetSize = (typeof FLEET_SIZES)[number];

/** Registrations accepted in a day, across everyone. A guard against a bot filling the table, not a limit a real launch hits. */
export const DAILY_CAP = 500;

export interface Tester {
  readonly id: TesterId;
  readonly email: string;
  readonly name: string | undefined;
  readonly role: Role;
  readonly company: string | undefined;
  readonly fleetSize: FleetSize | undefined;
  readonly consentedAt: Date;
  readonly createdAt: Date;
}

export interface InvalidSignup extends TaggedError<'InvalidSignup'> {
  readonly reason: 'email' | 'role' | 'name' | 'company' | 'fleet_size' | 'consent';
}

/** "  Sam@Example.COM " is "sam@example.com". */
export const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

/** Not a full address check (only a message to it proves one works), just enough to turn away typos and junk. */
export const looksLikeEmail = (email: string): boolean =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && !email.includes('..');

export interface CheckedSignup {
  readonly email: string;
  readonly name: string | undefined;
  readonly role: Role;
  readonly company: string | undefined;
  readonly fleetSize: FleetSize | undefined;
}

export function validateSignup(input: {
  readonly email: string;
  readonly name?: string | undefined;
  readonly role: string;
  readonly company?: string | undefined;
  readonly fleetSize?: string | undefined;
  readonly consent: boolean;
}): Result<CheckedSignup, InvalidSignup> {
  const email = normaliseEmail(input.email);
  if (!looksLikeEmail(email)) return err({ tag: 'InvalidSignup', reason: 'email' });
  if (!input.consent) return err({ tag: 'InvalidSignup', reason: 'consent' });
  if (!(ROLES as readonly string[]).includes(input.role)) {
    return err({ tag: 'InvalidSignup', reason: 'role' });
  }
  const name = input.name?.trim();
  if (name !== undefined && name.length > 80) return err({ tag: 'InvalidSignup', reason: 'name' });
  const company = input.company?.trim();
  if (company !== undefined && company.length > 120) {
    return err({ tag: 'InvalidSignup', reason: 'company' });
  }
  if (
    input.fleetSize !== undefined &&
    input.fleetSize !== '' &&
    !(FLEET_SIZES as readonly string[]).includes(input.fleetSize)
  ) {
    return err({ tag: 'InvalidSignup', reason: 'fleet_size' });
  }
  return ok({
    email,
    name: name === undefined || name === '' ? undefined : name,
    role: input.role as Role,
    company: company === undefined || company === '' ? undefined : company,
    fleetSize:
      input.fleetSize === undefined || input.fleetSize === ''
        ? undefined
        : (input.fleetSize as FleetSize),
  });
}
