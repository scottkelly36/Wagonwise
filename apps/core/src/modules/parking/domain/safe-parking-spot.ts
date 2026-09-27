import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type SafeParkingSpotId = Id<'SafeParkingSpotId'>;

// parking owns its own DriverId rather than importing identity's, same reasoning as congestion's
// and hazards' own copies (decision 46, docs/progress.md) — same brand name, so a value identity
// produces is usable here with no cross-module import.
export type DriverId = Id<'DriverId'>;

// parking owns its own GeoPoint too, for the same reason.
export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** A driver-vouched place to park an HGV (layby, truck stop) — a persistent point of interest,
 *  not a restriction (`applies()` never touches this) and not a decaying condition like a
 *  congestion report (no `expiresAt`, docs/progress.md's M9 scoping). Stays until someone builds
 *  a dismiss/delete path for it — not needed in v1. */
export interface SafeParkingSpot {
  readonly id: SafeParkingSpotId;
  readonly reporterId: DriverId;
  readonly location: GeoPoint;
  readonly note: string | undefined;
  readonly reportedAt: Date;
}

// A short free-text note ("flat layby, room for a 44-tonner"), not a moderated field — long
// enough to be useful, short enough that a marker callout can show it in full.
export const MAX_NOTE_LENGTH = 280;

export interface InvalidNote extends TaggedError<'InvalidNote'> {
  readonly reason: 'too_long';
}

export function validateNote(note: string | undefined): Result<string | undefined, InvalidNote> {
  if (note !== undefined && note.length > MAX_NOTE_LENGTH) {
    return err({ tag: 'InvalidNote', reason: 'too_long' });
  }
  return ok(note);
}
