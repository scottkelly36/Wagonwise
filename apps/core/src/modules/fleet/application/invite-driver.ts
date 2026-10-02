import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { inviteDriver as makeInvitation, normalizeIdentifier } from '../domain/driver-link.js';
import type { DriverLink, InvalidIdentifier } from '../domain/driver-link.js';
import type { CompanyId } from '../domain/vehicle.js';
import { canManageFleet } from './authorization.js';
import type { AlreadyInvited, Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { DriverLinkRepository } from './ports/driver-link-repository.js';

export interface InviteDriverDeps {
  readonly links: Pick<DriverLinkRepository, 'findPendingInvite' | 'save'>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export type InviteDriverError = Forbidden | InvalidIdentifier | AlreadyInvited;

/** Staff invite someone by phone or email. The person need not have an account, and the answer
 *  never says whether they do. They see it in the app and accept or decline. */
export async function inviteDriver(
  deps: InviteDriverDeps,
  input: { readonly caller: Caller; readonly companyId: CompanyId; readonly identifier: string },
): Promise<Result<DriverLink, InviteDriverError>> {
  if (!canManageFleet(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  const identifier = normalizeIdentifier(input.identifier);
  if (!identifier.ok) return identifier;
  if ((await deps.links.findPendingInvite(input.companyId, identifier.value)) !== null) {
    return err({ tag: 'AlreadyInvited' });
  }
  const link = makeInvitation(
    makeId<'DriverLinkId'>(deps.ids.newId()),
    input.companyId,
    identifier.value,
    deps.clock.now(),
  );
  if (!link.ok) return link;
  await deps.links.save(link.value);
  return ok(link.value);
}
