import type { Clock } from '../../../shared/ports/clock.js';
import { ok, type Result } from '../../../shared/result.js';
import {
  MERGE_RADIUS_M,
  validateNote,
  type DriverId,
  type GeoPoint,
  type InvalidNote,
  type SafeParkingSpot,
  type SafeParkingSpotId,
} from '../domain/safe-parking-spot.js';
import type { ParkingRepository } from './ports/parking-repository.js';

export interface ReportSafeParkingSpotDeps {
  readonly repo: Pick<
    ParkingRepository,
    'save' | 'findNearest' | 'addReport' | 'findReport' | 'find'
  >;
  readonly clock: Clock;
}

export interface ReportSafeParkingSpotInput {
  readonly id: SafeParkingSpotId;
  readonly reporterId: DriverId;
  readonly location: GeoPoint;
  readonly note: string | undefined;
}

export type ReportSafeParkingSpotError = InvalidNote;

/**
 * `id` is client-generated (the offline-queue idempotency pattern, decision 62), and names this report: a retry returns the
 * place it was filed against. A report within `MERGE_RADIUS_M` of a spot already on the map is added to that spot instead of
 * making a second pin, keeping its note; the newest report decides the spot's last-reported time and (for a spot a driver
 * marked) its note. Otherwise it makes a new spot.
 */
export async function reportSafeParkingSpot(
  deps: ReportSafeParkingSpotDeps,
  input: ReportSafeParkingSpotInput,
): Promise<Result<SafeParkingSpot, ReportSafeParkingSpotError>> {
  const filed = await deps.repo.findReport(input.id);
  if (filed !== null) {
    const spot = await deps.repo.find(filed.spotId);
    if (spot !== null) return ok(spot);
  }

  const validated = validateNote(input.note);
  if (!validated.ok) {
    return validated;
  }
  const now = deps.clock.now();

  const near = await deps.repo.findNearest(input.location, MERGE_RADIUS_M);
  if (near !== null) {
    await deps.repo.addReport({
      id: input.id,
      spotId: near.id,
      reporterId: input.reporterId,
      note: validated.value,
      reportedAt: now,
    });
    const merged = await deps.repo.find(near.id);
    return ok(merged ?? near);
  }

  const spot: SafeParkingSpot = {
    id: input.id,
    reporterId: input.reporterId,
    location: input.location,
    note: validated.value,
    reportedAt: now,
    lastReportedAt: now,
    source: 'driver',
  };
  await deps.repo.save(spot);
  return ok((await deps.repo.find(spot.id)) ?? spot);
}
