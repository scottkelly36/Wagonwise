import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { STAFF_INVITE_LIFETIME_MS, type StaffInvite } from '../domain/staff-invite.js';
import { audit } from './audit.js';
import type { CreatedStaffInvite, EmailAlreadyInUse } from './create-staff-invite.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

/** A WagonWise admin already exists: invite more from the dashboard's Users screen instead. */
export type AdminAlreadyExists = TaggedError<'AdminAlreadyExists'>;

/**
 * The first WagonWise admin (P2-M1.12b). Every other invite comes from someone signed in; this
 * one can't, so it comes from `pnpm staff:bootstrap` on the server. It only works while there is
 * no WagonWise admin at all, so it can't be used to slip in a second one later. Running it again
 * before the link is used just issues a fresh link.
 */
export async function bootstrapFirstAdmin(
  deps: Pick<StaffDeps, 'accounts' | 'invites' | 'auditLog' | 'randomCodes' | 'clock' | 'ids'>,
  input: { readonly email: string; readonly name: string },
): Promise<Result<CreatedStaffInvite, AdminAlreadyExists | EmailAlreadyInUse>> {
  const everyone = await deps.accounts.listAll();
  if (everyone.some((account) => account.kind === 'platform')) {
    return err({ tag: 'AdminAlreadyExists' });
  }
  if ((await deps.accounts.findByEmail(input.email)) !== null) {
    return err({ tag: 'EmailAlreadyInUse' });
  }

  const now = deps.clock.now();
  const token = deps.randomCodes.inviteToken();
  const invite: StaffInvite = {
    id: makeId<'StaffInviteId'>(deps.ids.newId()),
    kind: 'platform',
    companyId: undefined,
    email: input.email.trim(),
    name: input.name.trim(),
    privileges: [],
    tokenHash: sha256Hex(token),
    invitedBy: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + STAFF_INVITE_LIFETIME_MS),
    acceptedAt: null,
  };
  await deps.invites.save(invite);
  await audit(deps, {
    action: 'invite_created',
    details: { email: invite.email, kind: 'platform', via: 'bootstrap' },
  });
  return ok({ invite, token });
}
