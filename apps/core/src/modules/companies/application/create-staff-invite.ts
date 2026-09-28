import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId } from '../domain/company.js';
import type { Actor, Privilege } from '../domain/staff-account.js';
import { STAFF_INVITE_LIFETIME_MS, type StaffInvite } from '../domain/staff-invite.js';
import {
  checkFleetInvite,
  checkPlatformInvite,
  type Forbidden,
  type PrivilegeNotHeld,
} from '../domain/staff-policy.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

export type EmailAlreadyInUse = TaggedError<'EmailAlreadyInUse'>;

export type CreateStaffInviteInput =
  | { readonly kind: 'platform'; readonly email: string; readonly name: string }
  | {
      readonly kind: 'fleet';
      readonly email: string;
      readonly name: string;
      readonly companyId: CompanyId;
      readonly privileges: readonly Privilege[];
    };

export interface CreatedStaffInvite {
  readonly invite: StaffInvite;
  /** The secret for the invite link. Returned once, never stored (only its hash is). The
   *  dashboard shows the link for the inviter to send; emailing it directly comes later. */
  readonly token: string;
}

export async function createStaffInvite(
  deps: Pick<StaffDeps, 'accounts' | 'invites' | 'randomCodes' | 'clock' | 'ids'>,
  actor: Actor,
  input: CreateStaffInviteInput,
): Promise<Result<CreatedStaffInvite, Forbidden | PrivilegeNotHeld | EmailAlreadyInUse>> {
  const allowed =
    input.kind === 'platform'
      ? checkPlatformInvite(actor)
      : checkFleetInvite(actor, input.companyId, input.privileges);
  if (!allowed.ok) return allowed;

  if ((await deps.accounts.findByEmail(input.email)) !== null) {
    return err({ tag: 'EmailAlreadyInUse' });
  }

  const now = deps.clock.now();
  const token = deps.randomCodes.inviteToken();
  const invite: StaffInvite = {
    id: makeId<'StaffInviteId'>(deps.ids.newId()),
    kind: input.kind,
    companyId: input.kind === 'fleet' ? input.companyId : undefined,
    email: input.email.trim(),
    name: input.name.trim(),
    privileges: input.kind === 'fleet' ? [...input.privileges] : [],
    tokenHash: sha256Hex(token),
    invitedBy: actor.staffId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + STAFF_INVITE_LIFETIME_MS),
    acceptedAt: null,
  };
  await deps.invites.save(invite);
  return ok({ invite, token });
}
