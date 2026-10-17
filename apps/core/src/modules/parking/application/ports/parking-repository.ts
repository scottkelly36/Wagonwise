import type {
  GeoPoint,
  ParkingKind,
  ParkingSource,
  SafeParkingSpot,
  SafeParkingSpotId,
  SpotReport,
} from '../../domain/safe-parking-spot.js';
import type { SpotSuggestion, SuggestionId } from '../../domain/spot-suggestion.js';

export interface SpotSearch {
  /** Words to find in the name or note, ignoring case. */
  readonly text?: string | undefined;
  readonly source?: ParkingSource | undefined;
  readonly kind?: ParkingKind | undefined;
  readonly limit: number;
}

export interface ParkingRepository {
  /** Candidates within `radiusM` of a corridor — mirrors hazards'/congestion's own
   *  `findNearbyLine` (a single-point corridor degrades to a plain radius check). */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SafeParkingSpot[]>;
  /** Insert-only for a driver's report — a safe-parking spot has no lifecycle to persist through repeated writes,
   *  same reasoning as congestion's `save` (no confirm/dismiss/expire path in v1). Staff add spots through this too. */
  save(spot: SafeParkingSpot): Promise<void>;
  /** The nearest spot of any source within `radiusM`, or null. */
  findNearest(point: GeoPoint, radiusM: number): Promise<SafeParkingSpot | null>;
  /** A driver's report of an existing place. Adds nothing if a report with that id exists; says whether it was new. Moves the
   *  spot's last-reported time on, and for a spot a driver reported, its note to this report's (the latest wins). */
  addReport(report: SpotReport): Promise<boolean>;
  findReport(id: string): Promise<SpotReport | null>;
  /** Takes back one driver's report (the Undo). The spot goes too if a driver made it and no other report is left; otherwise
   *  it stays, with its note and last-reported time worked out again from the reports that remain. False if there is no such
   *  report or it is someone else's. */
  removeReport(id: string, reporterId: string): Promise<boolean>;

  // --- for WagonWise staff ---
  /** Parking spots before lay-bys, newest first within each, matching the search, and how many match in all. */
  search(search: SpotSearch): Promise<{ spots: SafeParkingSpot[]; total: number }>;
  countBySource(): Promise<Record<ParkingSource, number>>;
  countByKind(): Promise<Record<ParkingKind, number>>;
  find(id: SafeParkingSpotId): Promise<SafeParkingSpot | null>;
  /** Replaces what staff may change on an existing spot; false if there is no such spot. */
  update(spot: SafeParkingSpot): Promise<boolean>;
  /** Deletes any spot; false if there was no such spot. */
  deleteAny(id: SafeParkingSpotId): Promise<boolean>;

  // --- drivers' suggested changes, waiting for staff ---
  /** Saves it, replacing any the same driver already has waiting for the same spot. */
  saveSuggestion(suggestion: SpotSuggestion): Promise<void>;
  /** How many this driver has waiting, not counting any for `exceptSpotId` (a new one for that spot replaces it). */
  countSuggestionsBy(suggesterId: string, exceptSpotId: SafeParkingSpotId): Promise<number>;
  /** Oldest first, each with its spot as it is now. */
  listSuggestions(limit: number): Promise<{ suggestion: SpotSuggestion; spot: SafeParkingSpot }[]>;
  findSuggestion(id: SuggestionId): Promise<SpotSuggestion | null>;
  deleteSuggestion(id: SuggestionId): Promise<boolean>;
  deleteSuggestionsBy(suggesterId: string): Promise<void>;
}
