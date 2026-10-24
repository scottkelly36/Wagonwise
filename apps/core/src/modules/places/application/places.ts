import { err, ok, type Result } from '../../../shared/result.js';
import type { Clock } from '../../../shared/ports/clock.js';
import {
  validatePlaceName,
  validatePlaceNote,
  type CompanyId,
  type GeoPoint,
  type InvalidName,
  type InvalidPlaceNote,
  type PlaceCategory,
  type PlaceReportReason,
  type SavedPlace,
  type SavedPlaceId,
} from '../domain/place.js';
import { canDelete, canMark, canView, type PlaceActor } from './authorization.js';
import type { Forbidden, PlaceNotFound } from './errors.js';
import type { DriverMembership } from './ports/directories.js';
import type { PlaceRepository } from './ports/place-repository.js';

export interface PlaceDeps {
  readonly repo: PlaceRepository;
  readonly membership: DriverMembership;
  readonly clock: Clock;
}

export interface MarkPlaceInput {
  readonly actor: PlaceActor;
  /** Chosen by the app, so a retry after a dropped connection does not make a second place. */
  readonly id: SavedPlaceId;
  /** Absent for a personal place: a driver with no company, whose place only they see. */
  readonly companyId: CompanyId | undefined;
  readonly category: PlaceCategory;
  readonly name: string;
  readonly note: string | undefined;
  readonly location: GeoPoint;
}

/** Marks a place, for the company or (without a company) for the driver alone. Marking the same id again
 *  is a retry and returns what is stored. */
export async function markPlace(
  deps: PlaceDeps,
  input: MarkPlaceInput,
): Promise<Result<SavedPlace, Forbidden | InvalidName | InvalidPlaceNote>> {
  if (!(await canMark(input.actor, input.companyId, deps.membership))) {
    return err({ tag: 'Forbidden' });
  }
  const name = validatePlaceName(input.name);
  if (!name.ok) return name;
  const note = validatePlaceNote(input.note);
  if (!note.ok) return note;

  const existing = await deps.repo.findById(input.id);
  if (existing !== null) {
    // A retry of the same request. Someone else's id is not ours to return.
    const sameOwner =
      existing.companyId === input.companyId &&
      (input.companyId !== undefined ||
        (input.actor.kind === 'driver' && existing.createdBy === input.actor.driverId));
    return sameOwner ? ok(existing) : err({ tag: 'Forbidden' });
  }
  const now = deps.clock.now();
  const place: SavedPlace = {
    id: input.id,
    companyId: input.companyId,
    category: input.category,
    name: name.value,
    note: note.value,
    location: input.location,
    isPublic: false,
    createdBy: input.actor.kind === 'driver' ? input.actor.driverId : undefined,
    createdAt: now,
    updatedAt: now,
  };
  await deps.repo.save(place);
  return ok(place);
}

/** The company's places, or (no company given) the driver's own personal ones. */
export async function listPlaces(
  deps: PlaceDeps,
  input: { readonly actor: PlaceActor; readonly companyId: CompanyId | undefined },
): Promise<Result<SavedPlace[], Forbidden>> {
  if (!(await canView(input.actor, input.companyId, deps.membership))) {
    return err({ tag: 'Forbidden' });
  }
  if (input.companyId === undefined) {
    return input.actor.kind === 'driver'
      ? ok(await deps.repo.listForDriver(input.actor.driverId))
      : err({ tag: 'Forbidden' });
  }
  return ok(await deps.repo.listForCompany(input.companyId));
}

export async function placesNear(
  deps: PlaceDeps,
  input: {
    readonly actor: PlaceActor;
    readonly companyId: CompanyId | undefined;
    readonly location: GeoPoint;
    readonly radiusM: number;
  },
): Promise<Result<SavedPlace[], Forbidden>> {
  if (!(await canView(input.actor, input.companyId, deps.membership))) {
    return err({ tag: 'Forbidden' });
  }
  if (input.companyId === undefined) {
    return input.actor.kind === 'driver'
      ? ok(await deps.repo.findNearForDriver(input.actor.driverId, input.location, input.radiusM))
      : err({ tag: 'Forbidden' });
  }
  return ok(await deps.repo.findNear(input.companyId, input.location, input.radiusM));
}

export interface UpdatePlaceInput {
  readonly actor: PlaceActor;
  readonly id: SavedPlaceId;
  readonly name?: string | undefined;
  readonly category?: PlaceCategory | undefined;
  /** An empty string clears the note; undefined leaves it. */
  readonly note?: string | undefined;
}

export async function updatePlace(
  deps: PlaceDeps,
  input: UpdatePlaceInput,
): Promise<Result<SavedPlace, Forbidden | PlaceNotFound | InvalidName | InvalidPlaceNote>> {
  const place = await deps.repo.findById(input.id);
  if (
    place === null ||
    !(await canView(input.actor, place.companyId, deps.membership, place.createdBy))
  ) {
    return err({ tag: 'PlaceNotFound' });
  }
  if (!(await canMark(input.actor, place.companyId, deps.membership, place.createdBy))) {
    return err({ tag: 'Forbidden' });
  }
  let name = place.name;
  if (input.name !== undefined) {
    const checked = validatePlaceName(input.name);
    if (!checked.ok) return checked;
    name = checked.value;
  }
  let note = place.note;
  if (input.note !== undefined) {
    const checked = validatePlaceNote(input.note);
    if (!checked.ok) return checked;
    note = checked.value;
  }
  const updated: SavedPlace = {
    ...place,
    name,
    note,
    category: input.category ?? place.category,
    updatedAt: deps.clock.now(),
  };
  await deps.repo.save(updated);
  return ok(updated);
}

/**
 * A driver who has joined a company shares one of their personal places with it. Only the owner, and only
 * into a company they have an active link with. Moving the other way (a company's place becoming personal)
 * is not offered: what was marked for a company stays the company's.
 */
export async function sharePlace(
  deps: PlaceDeps,
  input: { readonly actor: PlaceActor; readonly id: SavedPlaceId; readonly companyId: CompanyId },
): Promise<Result<SavedPlace, Forbidden | PlaceNotFound>> {
  const place = await deps.repo.findById(input.id);
  if (
    place === null ||
    place.companyId !== undefined ||
    input.actor.kind !== 'driver' ||
    place.createdBy !== input.actor.driverId
  ) {
    return err({ tag: 'PlaceNotFound' });
  }
  if (!(await canMark(input.actor, input.companyId, deps.membership))) {
    return err({ tag: 'Forbidden' });
  }
  await deps.repo.shareWithCompany(place.id, input.companyId, deps.clock.now());
  const shared = await deps.repo.findById(place.id);
  return shared === null ? err({ tag: 'PlaceNotFound' }) : ok(shared);
}

export async function deletePlace(
  deps: PlaceDeps,
  input: { readonly actor: PlaceActor; readonly id: SavedPlaceId },
): Promise<Result<void, Forbidden | PlaceNotFound>> {
  const place = await deps.repo.findById(input.id);
  if (
    place === null ||
    !(await canView(input.actor, place.companyId, deps.membership, place.createdBy))
  ) {
    return err({ tag: 'PlaceNotFound' });
  }
  if (!(await canDelete(input.actor, place, deps.membership))) return err({ tag: 'Forbidden' });
  await deps.repo.delete(place.id);
  return ok(undefined);
}

/** The most public places one request returns: enough for a map view, and a bound on what one request can pull. */
const PUBLIC_PLACES_LIMIT = 300;

/** Public places from every driver near a point. Drivers only: a company's staff have no use for them. */
export async function publicPlacesNear(
  deps: PlaceDeps,
  input: { readonly actor: PlaceActor; readonly location: GeoPoint; readonly radiusM: number },
): Promise<Result<SavedPlace[], Forbidden>> {
  if (input.actor.kind !== 'driver') return err({ tag: 'Forbidden' });
  return ok(await deps.repo.findPublicNear(input.location, input.radiusM, PUBLIC_PLACES_LIMIT));
}

/**
 * The owner of a personal place makes it public, or private again. A company's place cannot be made public (a customer's site
 * is not one driver's to publish), and a driver cannot change someone else's place: both answer "not found".
 */
export async function setPlaceVisibility(
  deps: PlaceDeps,
  input: { readonly actor: PlaceActor; readonly id: SavedPlaceId; readonly isPublic: boolean },
): Promise<Result<SavedPlace, PlaceNotFound>> {
  const place = await deps.repo.findById(input.id);
  if (
    place === null ||
    place.companyId !== undefined ||
    input.actor.kind !== 'driver' ||
    place.createdBy !== input.actor.driverId
  ) {
    return err({ tag: 'PlaceNotFound' });
  }
  await deps.repo.setPublic(place.id, input.isPublic, deps.clock.now());
  return ok({ ...place, isPublic: input.isPublic });
}

/** A driver reports someone else's public place. Their own is theirs to make private; a private one is not theirs to see. */
export async function reportPlace(
  deps: PlaceDeps,
  input: {
    readonly actor: PlaceActor;
    readonly id: SavedPlaceId;
    readonly reason: PlaceReportReason;
  },
): Promise<Result<void, Forbidden | PlaceNotFound>> {
  if (input.actor.kind !== 'driver') return err({ tag: 'Forbidden' });
  const place = await deps.repo.findById(input.id);
  if (place === null || !place.isPublic) return err({ tag: 'PlaceNotFound' });
  if (place.createdBy === input.actor.driverId) return err({ tag: 'Forbidden' });
  await deps.repo.addReport(place.id, input.actor.driverId, input.reason, deps.clock.now());
  return ok(undefined);
}
