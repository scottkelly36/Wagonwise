import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type SavedPlaceId = Id<'SavedPlaceId'>;
// places owns its own CompanyId and DriverId (same brand names as every module's own copy, so a value
// another module makes is usable here via makeId() without importing across the boundary).
export type CompanyId = Id<'CompanyId'>;
export type DriverId = Id<'DriverId'>;
export type StaffId = Id<'StaffId'>;

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export const PLACE_CATEGORIES = ['farm', 'yard', 'other'] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const PLACE_NAME_MAX = 80;
export const PLACE_NOTE_MAX = 500;

/**
 * Somewhere a driver has marked: the real gate of a farm whose postcode lands elsewhere, a customer's
 * yard entrance. Kept for future jobs. A company's driver marks it for the whole company (`companyId`
 * set); a driver with no company marks a personal one (`companyId` absent, `createdBy` is the owner,
 * and only they see it). The spot never moves: to correct it, delete and mark again. Name, category and
 * note can change.
 */
export interface SavedPlace {
  readonly id: SavedPlaceId;
  readonly companyId: CompanyId | undefined;
  readonly category: PlaceCategory;
  readonly name: string;
  readonly note: string | undefined;
  readonly location: GeoPoint;
  readonly createdBy: DriverId | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InvalidName extends TaggedError<'InvalidName'> {
  readonly reason: 'empty' | 'too_long';
}
export interface InvalidPlaceNote extends TaggedError<'InvalidPlaceNote'> {
  readonly reason: 'too_long';
}

export function validatePlaceName(raw: string): Result<string, InvalidName> {
  const name = raw.trim();
  if (name.length === 0) return err({ tag: 'InvalidName', reason: 'empty' });
  if (name.length > PLACE_NAME_MAX) return err({ tag: 'InvalidName', reason: 'too_long' });
  return ok(name);
}

/** A note is trimmed; an empty one means "no note". */
export function validatePlaceNote(
  raw: string | undefined,
): Result<string | undefined, InvalidPlaceNote> {
  if (raw === undefined) return ok(undefined);
  const note = raw.trim();
  if (note.length > PLACE_NOTE_MAX) return err({ tag: 'InvalidPlaceNote', reason: 'too_long' });
  return ok(note.length === 0 ? undefined : note);
}
