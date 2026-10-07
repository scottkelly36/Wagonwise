import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { DriverId, SafeParkingSpotId } from '../domain/safe-parking-spot.js';
import type { ParkingRepository } from './ports/parking-repository.js';

export interface DeleteSafeParkingSpotDeps {
  readonly repo: Pick<ParkingRepository, 'deleteOwned'>;
}

export type SafeParkingSpotNotFound = TaggedError<'SafeParkingSpotNotFound'>;

/**
 * A driver takes back a spot they marked (the Undo after a one-tap report). Only the reporter can:
 * a spot that is someone else's is reported as not found, the same as one that never existed, so
 * the endpoint cannot be used to find out which ids exist.
 */
export async function deleteSafeParkingSpot(
  deps: DeleteSafeParkingSpotDeps,
  input: { readonly id: SafeParkingSpotId; readonly reporterId: DriverId },
): Promise<Result<void, SafeParkingSpotNotFound>> {
  const deleted = await deps.repo.deleteOwned(input.id, input.reporterId);
  return deleted ? ok(undefined) : err({ tag: 'SafeParkingSpotNotFound' });
}
