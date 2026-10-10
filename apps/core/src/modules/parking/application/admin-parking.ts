import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { makeId } from '../../../shared/brand.js';
import {
  validateNote,
  type Facilities,
  type GeoPoint,
  type InvalidNote,
  type ParkingSource,
  type SafeParkingSpot,
  type SafeParkingSpotId,
} from '../domain/safe-parking-spot.js';
import type { ParkingRepository } from './ports/parking-repository.js';
import type { SafeParkingSpotNotFound } from './delete-safe-parking-spot.js';

export type Forbidden = TaggedError<'Forbidden'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

export interface AdminParkingDeps {
  readonly repo: ParkingRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

const forbidden = (): Result<never, Forbidden> => err({ tag: 'Forbidden' });

export interface SpotDetails extends Facilities {
  readonly location: GeoPoint;
  readonly name?: string | undefined;
  readonly note?: string | undefined;
  readonly capacity?: number | undefined;
}

const blankToUndefined = (text: string | undefined): string | undefined => {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

/** The parking spots, for WagonWise staff only: newest first, narrowed by a search and by source. */
export async function listSpots(
  deps: AdminParkingDeps,
  caller: StaffCaller,
  input: {
    readonly text?: string | undefined;
    readonly source?: ParkingSource | undefined;
    readonly limit: number;
  },
): Promise<
  Result<
    { spots: SafeParkingSpot[]; total: number; bySource: Record<ParkingSource, number> },
    Forbidden
  >
> {
  if (caller.kind !== 'platform') return forbidden();
  const [found, bySource] = await Promise.all([
    deps.repo.search({ text: input.text, source: input.source, limit: input.limit }),
    deps.repo.countBySource(),
  ]);
  return ok({ ...found, bySource });
}

/** Staff add a spot. It has no reporter and is marked as added by staff. */
export async function addSpot(
  deps: AdminParkingDeps,
  caller: StaffCaller,
  details: SpotDetails,
): Promise<Result<SafeParkingSpot, Forbidden | InvalidNote>> {
  if (caller.kind !== 'platform') return forbidden();
  const note = validateNote(blankToUndefined(details.note));
  if (!note.ok) return note;
  const spot: SafeParkingSpot = {
    id: makeId<'SafeParkingSpotId'>(deps.ids.newId()),
    reporterId: undefined,
    source: 'admin',
    reportedAt: deps.clock.now(),
    ...withDetails(details, note.value),
  };
  await deps.repo.save(spot);
  return ok(spot);
}

/** Staff change what they may on a spot of any source; where it came from and who reported it stay. */
export async function updateSpot(
  deps: AdminParkingDeps,
  caller: StaffCaller,
  id: SafeParkingSpotId,
  details: SpotDetails,
): Promise<Result<SafeParkingSpot, Forbidden | InvalidNote | SafeParkingSpotNotFound>> {
  if (caller.kind !== 'platform') return forbidden();
  const note = validateNote(blankToUndefined(details.note));
  if (!note.ok) return note;
  const existing = await deps.repo.find(id);
  if (existing === null) return err({ tag: 'SafeParkingSpotNotFound' });
  const spot: SafeParkingSpot = { ...existing, ...withDetails(details, note.value) };
  await deps.repo.update(spot);
  return ok(spot);
}

/** Staff delete any spot. */
export async function deleteSpot(
  deps: AdminParkingDeps,
  caller: StaffCaller,
  id: SafeParkingSpotId,
): Promise<Result<void, Forbidden | SafeParkingSpotNotFound>> {
  if (caller.kind !== 'platform') return forbidden();
  return (await deps.repo.deleteAny(id)) ? ok(undefined) : err({ tag: 'SafeParkingSpotNotFound' });
}

/** The editable fields in full: one left out is saved as "not known". */
function withDetails(
  details: SpotDetails,
  note: string | undefined,
): Omit<SafeParkingSpot, 'id' | 'reporterId' | 'source' | 'reportedAt' | 'osmId'> {
  return {
    location: details.location,
    name: blankToUndefined(details.name),
    note,
    capacity: details.capacity,
    paid: details.paid,
    toilets: details.toilets,
    showers: details.showers,
    shop: details.shop,
    food: details.food,
    fuel: details.fuel,
    lit: details.lit,
    secure: details.secure,
  };
}
