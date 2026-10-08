import type { CompanyId, DriverId, SavedPlace } from '../domain/place.js';
import type { DriverMembership, StaffCaller } from './ports/directories.js';

export type PlaceActor = { readonly kind: 'driver'; readonly driverId: DriverId } | StaffCaller;

/**
 * Whose places these are: a company's (`companyId` given) or one driver's own personal ones (absent).
 * Personal places belong to the driver alone; no staff account, not even a WagonWise admin's, is offered
 * them through these routes.
 */
export async function canView(
  actor: PlaceActor,
  companyId: CompanyId | undefined,
  membership: DriverMembership,
  ownerOfPersonal?: DriverId,
): Promise<boolean> {
  if (companyId === undefined) {
    return (
      actor.kind === 'driver' &&
      (ownerOfPersonal === undefined || ownerOfPersonal === actor.driverId)
    );
  }
  if (actor.kind === 'driver') {
    return membership.isActiveDriverOfCompany(actor.driverId, companyId);
  }
  return actor.kind === 'platform' || actor.companyId === companyId;
}

/** Marking and editing: any of the company's drivers (a better note helps the next one), and
 *  dispatchers. A personal place: its owner only. */
export async function canMark(
  actor: PlaceActor,
  companyId: CompanyId | undefined,
  membership: DriverMembership,
  ownerOfPersonal?: DriverId,
): Promise<boolean> {
  if (companyId === undefined) {
    return (
      actor.kind === 'driver' &&
      (ownerOfPersonal === undefined || ownerOfPersonal === actor.driverId)
    );
  }
  if (actor.kind === 'driver') {
    return membership.isActiveDriverOfCompany(actor.driverId, companyId);
  }
  return (
    actor.kind === 'platform' ||
    (actor.companyId === companyId && actor.privileges.includes('dispatch'))
  );
}

/** Deleting: the driver who marked it (the Undo), or a dispatcher. Not any driver: one driver should
 *  not be able to wipe what others marked. */
export async function canDelete(
  actor: PlaceActor,
  place: SavedPlace,
  membership: DriverMembership,
): Promise<boolean> {
  if (place.companyId === undefined) {
    return actor.kind === 'driver' && place.createdBy === actor.driverId;
  }
  if (actor.kind === 'driver') {
    return (
      place.createdBy === actor.driverId &&
      (await membership.isActiveDriverOfCompany(actor.driverId, place.companyId))
    );
  }
  return (
    actor.kind === 'platform' ||
    (actor.companyId === place.companyId && actor.privileges.includes('dispatch'))
  );
}
