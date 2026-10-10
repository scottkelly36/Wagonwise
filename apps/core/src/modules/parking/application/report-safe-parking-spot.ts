import type { Clock } from '../../../shared/ports/clock.js';
import { ok, type Result } from '../../../shared/result.js';
import {
  validateNote,
  type DriverId,
  type GeoPoint,
  type InvalidNote,
  type SafeParkingSpot,
  type SafeParkingSpotId,
} from '../domain/safe-parking-spot.js';
import type { ParkingRepository } from './ports/parking-repository.js';

export interface ReportSafeParkingSpotDeps {
  readonly repo: Pick<ParkingRepository, 'save'>;
  readonly clock: Clock;
}

export interface ReportSafeParkingSpotInput {
  readonly id: SafeParkingSpotId;
  readonly reporterId: DriverId;
  readonly location: GeoPoint;
  readonly note: string | undefined;
}

export type ReportSafeParkingSpotError = InvalidNote;

/** `id` is client-generated — same offline-queue idempotency pattern as hazards'/congestion's own
 *  report use cases (decision 62). No merge with a nearby spot: several drivers vouching for the
 *  same layby just show as several markers for now, same phase-1 simplification congestion's own
 *  `reportCongestion` made. */
export async function reportSafeParkingSpot(
  deps: ReportSafeParkingSpotDeps,
  input: ReportSafeParkingSpotInput,
): Promise<Result<SafeParkingSpot, ReportSafeParkingSpotError>> {
  const validated = validateNote(input.note);
  if (!validated.ok) {
    return validated;
  }

  const spot: SafeParkingSpot = {
    id: input.id,
    reporterId: input.reporterId,
    location: input.location,
    note: validated.value,
    reportedAt: deps.clock.now(),
    source: 'driver',
  };
  await deps.repo.save(spot);
  return ok(spot);
}
