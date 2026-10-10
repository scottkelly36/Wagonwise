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

/** A place to park an HGV: usually driver-vouched, and now also added by staff or imported to park an HGV (layby, truck stop) — a persistent point of interest,
 *  not a restriction (`applies()` never touches this) and not a decaying condition like a
 *  congestion report (no `expiresAt`, docs/progress.md's M9 scoping). Stays until someone builds
 *  a dismiss/delete path for it — not needed in v1. */
export interface SafeParkingSpot extends Facilities {
  readonly id: SafeParkingSpotId;
  /** The driver who reported it; absent for a spot added by staff or imported. */
  readonly reporterId: DriverId | undefined;
  readonly location: GeoPoint;
  readonly note: string | undefined;
  readonly reportedAt: Date;
  /** Where it came from: a driver's report, WagonWise staff, or the one-off OpenStreetMap import. */
  readonly source: ParkingSource;
  readonly osmId?: string | undefined;
  readonly name?: string | undefined;
  readonly capacity?: number | undefined;
  /** When anyone last vouched for it: a driver's report, or its creation. The latest report wins. */
  readonly lastReportedAt?: Date | undefined;
  /** How many different drivers have reported this place. */
  readonly reporterCount?: number | undefined;
  /** The latest notes drivers left, newest first. Every note is kept; this is only the newest few. */
  readonly recentNotes?: readonly string[] | undefined;
}

/** One driver's report of a place: the place may be a spot someone else marked first. */
export interface SpotReport {
  /** The id the driver's phone made, so a retry is harmless and "undo" removes just this report. */
  readonly id: string;
  readonly spotId: SafeParkingSpotId;
  readonly reporterId: DriverId;
  readonly note: string | undefined;
  readonly reportedAt: Date;
}

/**
 * A report within this many metres of a spot is added to that spot instead of making a second pin. A lay-by is longer than a
 * lorry and GPS wanders, so this is generous enough to catch the same place and small enough not to join neighbours.
 */
export const MERGE_RADIUS_M = 30;

export type ParkingSource = 'driver' | 'admin' | 'osm';

/** What a driver wants to know before pulling in. Undefined means nobody has said, which is not the same as no. */
export interface Facilities {
  readonly paid?: boolean | undefined;
  readonly toilets?: boolean | undefined;
  readonly showers?: boolean | undefined;
  readonly shop?: boolean | undefined;
  readonly food?: boolean | undefined;
  readonly fuel?: boolean | undefined;
  readonly lit?: boolean | undefined;
  readonly secure?: boolean | undefined;
}

export const FACILITY_KEYS = [
  'paid',
  'toilets',
  'showers',
  'shop',
  'food',
  'fuel',
  'lit',
  'secure',
] as const;

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
