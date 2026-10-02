import { err, ok, type Result } from '../../../shared/result.js';
import type { DriverLink } from '../domain/driver-link.js';
import type { CompanyId } from '../domain/vehicle.js';
import { canViewFleet } from './authorization.js';
import type { DriverActor } from './driver-actor.js';
import type { Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { DriverLinkRepository } from './ports/driver-link-repository.js';

/** A company's links (requests waiting, invitations out, active and past drivers). */
export async function listCompanyDriverLinks(
  deps: { readonly links: Pick<DriverLinkRepository, 'listForCompany'> },
  input: { readonly caller: Caller; readonly companyId: CompanyId },
): Promise<Result<DriverLink[], Forbidden>> {
  if (!canViewFleet(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.links.listForCompany(input.companyId));
}

/** A driver's own links, plus invitations made for their phone or email. */
export async function listMyDriverLinks(
  deps: { readonly links: Pick<DriverLinkRepository, 'listForDriver'> },
  input: { readonly actor: DriverActor },
): Promise<DriverLink[]> {
  return deps.links.listForDriver(input.actor.driverId, input.actor.identifier);
}
