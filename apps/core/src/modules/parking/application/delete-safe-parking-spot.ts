import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { DriverId, SafeParkingSpotId } from '../domain/safe-parking-spot.js';
import type { ParkingRepository } from './ports/parking-repository.js';

export interface DeleteSafeParkingSpotDeps {
  readonly repo: Pick<ParkingRepository, 'removeReport'>;
}

export type SafeParkingSpotNotFound = TaggedError<'SafeParkingSpotNotFound'>;

/**
 * A driver takes back a report they made (the Undo after a one-tap report); `id` is the report's id, which for a spot nobody
 * else has since vouched for is the spot's. Only the reporter can: someone else's report is reported as not found, the same as
 * one that never existed, so the endpoint cannot be used to find out which ids exist. A spot other drivers have since vouched for
 * stays; only this driver's report goes.
 */
export async function deleteSafeParkingSpot(
  deps: DeleteSafeParkingSpotDeps,
  input: { readonly id: SafeParkingSpotId | string; readonly reporterId: DriverId },
): Promise<Result<void, SafeParkingSpotNotFound>> {
  const deleted = await deps.repo.removeReport(input.id, input.reporterId);
  return deleted ? ok(undefined) : err({ tag: 'SafeParkingSpotNotFound' });
}
