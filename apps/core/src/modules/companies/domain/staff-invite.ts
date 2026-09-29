import type { Id } from '../../../shared/brand.js';
import type { CompanyId } from './company.js';
import type { Privilege, StaffId } from './staff-account.js';

export type StaffInviteId = Id<'StaffInviteId'>;

/** 7 days to accept, then the invite has to be sent again. */
export const STAFF_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * An emailed invitation to become a staff member. Only a hash of the emailed token is kept.
 * A fleet invite names its company; a platform invite has no company and no privileges.
 */
export interface StaffInvite {
  readonly id: StaffInviteId;
  readonly kind: 'platform' | 'fleet';
  readonly companyId?: CompanyId | undefined;
  readonly email: string;
  readonly name: string;
  readonly privileges: readonly Privilege[];
  readonly tokenHash: string;
  /** Null only for the bootstrap invite that creates the first WagonWise admin (P2-M1.12b). */
  readonly invitedBy: StaffId | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
}

export function isInviteOpen(invite: StaffInvite, now: Date): boolean {
  return invite.acceptedAt === null && invite.expiresAt.getTime() > now.getTime();
}
