import { err, ok, type Result } from '../../../shared/result.js';
import { isInviteOpen } from '../domain/staff-invite.js';
import type { InviteNotUsable } from './accept-staff-invite.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

export interface StaffInvitePreview {
  /** Who it is for, as the inviter typed it. */
  readonly name: string;
  /** The company they are joining; absent for a WagonWise staff invite. */
  readonly companyName?: string | undefined;
}

/**
 * What the join page shows before anything is chosen: whose invitation this is and which company it is for, so a person knows they
 * are joining the right firm. Only someone holding the emailed link can ask, and an unknown, used or expired link gets the same
 * single error as accepting one does.
 */
export async function previewStaffInvite(
  deps: Pick<StaffDeps, 'invites' | 'companies' | 'clock'>,
  input: { readonly inviteToken: string },
): Promise<Result<StaffInvitePreview, InviteNotUsable>> {
  const invite = await deps.invites.findByTokenHash(sha256Hex(input.inviteToken));
  if (!invite || !isInviteOpen(invite, deps.clock.now())) return err({ tag: 'InviteNotUsable' });
  const company =
    invite.companyId === undefined ? null : await deps.companies.findById(invite.companyId);
  return ok({ name: invite.name, ...(company === null ? {} : { companyName: company.name }) });
}
