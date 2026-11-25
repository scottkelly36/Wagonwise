import type { Id } from '../../../shared/brand.js';
import type { StaffId } from './staff-account.js';

export type StaffPasswordResetId = Id<'StaffPasswordResetId'>;

/** An hour to use the emailed link: long enough to find the email, short enough that an old one is worthless. */
export const PASSWORD_RESET_LIFETIME_MS = 60 * 60 * 1000;

/** How many links one account may be sent in an hour, so the form cannot be used to flood someone's inbox. */
export const PASSWORD_RESET_MAX_PER_HOUR = 3;
export const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;

/**
 * A link to choose a new password. Only a hash of the emailed token is kept. It works once; using one also signs the account out
 * everywhere. It never skips the second factor: the next sign-in still asks for it.
 */
export interface StaffPasswordReset {
  readonly id: StaffPasswordResetId;
  readonly staffId: StaffId;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export function isResetOpen(reset: StaffPasswordReset, now: Date): boolean {
  return reset.usedAt === null && reset.expiresAt.getTime() > now.getTime();
}
