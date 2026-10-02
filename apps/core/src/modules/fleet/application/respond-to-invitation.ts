import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { driverJoinedFleetEvent } from '../domain/driver-link-events.js';
import {
  acceptInvitation,
  decline,
  type DriverLink,
  type DriverLinkId,
  type InvalidLinkTransition,
} from '../domain/driver-link.js';
import type { DriverActor } from './driver-actor.js';
import type { AlreadyLinked, LinkNotFound } from './errors.js';
import type { DriverLinkRepository } from './ports/driver-link-repository.js';

export interface RespondToInvitationDeps {
  readonly links: Pick<DriverLinkRepository, 'findById' | 'findLive' | 'save'>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export type RespondToInvitationError = LinkNotFound | AlreadyLinked | InvalidLinkTransition;

/** The driver's answer to an invitation made for their phone or email. Only the person it was
 *  made for can see it, so anyone else gets "not found". Accepting makes them active. */
export async function respondToInvitation(
  deps: RespondToInvitationDeps,
  input: { readonly actor: DriverActor; readonly linkId: DriverLinkId; readonly accept: boolean },
): Promise<Result<DriverLink, RespondToInvitationError>> {
  const link = await deps.links.findById(input.linkId);
  if (
    link === null ||
    link.status !== 'invited' ||
    link.invitedIdentifier !== input.actor.identifier
  ) {
    return err({ tag: 'LinkNotFound' });
  }
  const at = deps.clock.now();

  if (!input.accept) {
    const declined = decline(link, at);
    if (!declined.ok) return declined;
    await deps.links.save(declined.value);
    return ok(declined.value);
  }

  // They may already have asked with the code: one live link per company.
  if ((await deps.links.findLive(link.companyId, input.actor.driverId)) !== null) {
    return err({ tag: 'AlreadyLinked' });
  }
  const accepted = acceptInvitation(link, input.actor.driverId, at);
  if (!accepted.ok) return accepted;
  await deps.links.save(accepted.value, [driverJoinedFleetEvent(deps.ids.newId(), accepted.value)]);
  return ok(accepted.value);
}
