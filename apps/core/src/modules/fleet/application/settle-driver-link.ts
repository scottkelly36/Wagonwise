import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { driverJoinedFleetEvent, driverLeftFleetEvent } from '../domain/driver-link-events.js';
import {
  approveRequest as approve,
  decline as declineLink,
  leave,
  type DriverLink,
  type DriverLinkId,
  type InvalidLinkTransition,
} from '../domain/driver-link.js';
import { canManageFleet, canViewFleet } from './authorization.js';
import type { DriverActor } from './driver-actor.js';
import type { Forbidden, LinkNotFound } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { DriverLinkRepository } from './ports/driver-link-repository.js';

export interface SettleDriverLinkDeps {
  readonly links: Pick<DriverLinkRepository, 'findById' | 'save'>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export type SettleDriverLinkError = LinkNotFound | Forbidden | InvalidLinkTransition;

/** The company's side: loads the link if the caller can see its company (else "not found", same as
 *  an unknown id), then requires `manage_fleet`. */
async function loadForStaff(
  deps: SettleDriverLinkDeps,
  caller: Caller,
  linkId: DriverLinkId,
): Promise<Result<DriverLink, LinkNotFound | Forbidden>> {
  const link = await deps.links.findById(linkId);
  if (link === null || !canViewFleet(caller, link.companyId)) return err({ tag: 'LinkNotFound' });
  if (!canManageFleet(caller, link.companyId)) return err({ tag: 'Forbidden' });
  return ok(link);
}

interface StaffInput {
  readonly caller: Caller;
  readonly linkId: DriverLinkId;
}

/** The company approves a driver's request: they become active. */
export async function approveDriverRequest(
  deps: SettleDriverLinkDeps,
  input: StaffInput,
): Promise<Result<DriverLink, SettleDriverLinkError>> {
  const loaded = await loadForStaff(deps, input.caller, input.linkId);
  if (!loaded.ok) return loaded;
  const next = approve(loaded.value, deps.clock.now());
  if (!next.ok) return next;
  await deps.links.save(next.value, [driverJoinedFleetEvent(deps.ids.newId(), next.value)]);
  return ok(next.value);
}

/** The company rejects a request, or cancels an invitation it made. */
export async function declineDriverLink(
  deps: SettleDriverLinkDeps,
  input: StaffInput,
): Promise<Result<DriverLink, SettleDriverLinkError>> {
  const loaded = await loadForStaff(deps, input.caller, input.linkId);
  if (!loaded.ok) return loaded;
  const next = declineLink(loaded.value, deps.clock.now());
  if (!next.ok) return next;
  await deps.links.save(next.value);
  return ok(next.value);
}

/** The company removes an active driver. */
export async function removeDriver(
  deps: SettleDriverLinkDeps,
  input: StaffInput,
): Promise<Result<DriverLink, SettleDriverLinkError>> {
  const loaded = await loadForStaff(deps, input.caller, input.linkId);
  if (!loaded.ok) return loaded;
  const next = leave(loaded.value, deps.clock.now());
  if (!next.ok) return next;
  await deps.links.save(next.value, [
    driverLeftFleetEvent(deps.ids.newId(), next.value, 'company'),
  ]);
  return ok(next.value);
}

/** The driver leaves a company, or withdraws a request they made. Another driver's link is "not
 *  found". */
export async function leaveFleet(
  deps: SettleDriverLinkDeps,
  input: { readonly actor: DriverActor; readonly linkId: DriverLinkId },
): Promise<Result<DriverLink, LinkNotFound | InvalidLinkTransition>> {
  const link = await deps.links.findById(input.linkId);
  if (link === null || link.driverId !== input.actor.driverId) return err({ tag: 'LinkNotFound' });
  const at = deps.clock.now();
  if (link.status === 'requested') {
    const withdrawn = declineLink(link, at);
    if (!withdrawn.ok) return withdrawn;
    await deps.links.save(withdrawn.value);
    return ok(withdrawn.value);
  }
  const next = leave(link, at);
  if (!next.ok) return next;
  await deps.links.save(next.value, [driverLeftFleetEvent(deps.ids.newId(), next.value, 'driver')]);
  return ok(next.value);
}
