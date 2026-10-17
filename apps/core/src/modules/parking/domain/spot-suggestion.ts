import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  FACILITY_KEYS,
  MAX_NOTE_LENGTH,
  type Facilities,
  type SafeParkingSpot,
} from './safe-parking-spot.js';

export type SuggestionId = Id<'SpotSuggestionId'>;

export const MAX_NAME_LENGTH = 120;
export const MAX_CAPACITY = 5000;
/** The most suggestions one driver can have waiting at once, so nobody can bury the review list. */
export const MAX_WAITING_PER_DRIVER = 20;

/** The fields a driver may suggest changing. Only the ones they want changed are present. */
export interface SpotChanges extends Facilities {
  readonly name?: string | undefined;
  readonly note?: string | undefined;
  readonly capacity?: number | undefined;
}

/** A driver's suggested change to a spot, waiting for WagonWise staff. Nothing on the map changes until it is approved. */
export interface SpotSuggestion {
  readonly id: SuggestionId;
  readonly spotId: SafeParkingSpot['id'];
  readonly suggesterId: string;
  /** "This place is closed or gone": approving it deletes the spot. */
  readonly gone: boolean;
  readonly changes: SpotChanges;
  readonly suggestedAt: Date;
}

export interface InvalidSuggestion extends TaggedError<'InvalidSuggestion'> {
  readonly reason: 'empty' | 'name' | 'note' | 'capacity';
}

const SPOT_FIELDS = ['name', 'note', 'capacity', ...FACILITY_KEYS] as const;

type Value = string | number | boolean | undefined;

/**
 * Tidies the details a driver sent: words trimmed, blanks dropped, the name, tip and number of spaces checked. Anything equal to
 * `current` (what the spot already says) is dropped too, so a form that sends every field costs nothing.
 */
export function tidyChanges(
  current: Readonly<Record<string, Value>>,
  raw: Readonly<Record<string, Value>>,
): Result<SpotChanges, InvalidSuggestion> {
  const changes: Record<string, string | number | boolean> = {};
  for (const field of SPOT_FIELDS) {
    let value = raw[field];
    if (value === undefined) continue;
    if (field === 'name' || field === 'note') {
      value = (value as string).trim();
      if (field === 'name' && value.length > MAX_NAME_LENGTH) {
        return err({ tag: 'InvalidSuggestion', reason: 'name' });
      }
      if (field === 'note' && value.length > MAX_NOTE_LENGTH) {
        return err({ tag: 'InvalidSuggestion', reason: 'note' });
      }
      if (value === '') continue;
    }
    if (field === 'capacity') {
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_CAPACITY) {
        return err({ tag: 'InvalidSuggestion', reason: 'capacity' });
      }
    }
    if (value === current[field]) continue;
    changes[field] = value;
  }
  return ok(changes);
}

/**
 * Tidies a suggestion for a spot. Left with no change and not "gone", there is nothing to review.
 */
export function checkSuggestion(
  spot: SafeParkingSpot,
  input: { readonly gone: boolean; readonly changes: SpotChanges },
): Result<{ gone: boolean; changes: SpotChanges }, InvalidSuggestion> {
  if (input.gone) return ok({ gone: true, changes: {} });
  const tidied = tidyChanges(
    spot as unknown as Record<string, Value>,
    input.changes as Record<string, Value>,
  );
  if (!tidied.ok) return tidied;
  if (Object.keys(tidied.value).length === 0) {
    return err({ tag: 'InvalidSuggestion', reason: 'empty' });
  }
  return ok({ gone: false, changes: tidied.value });
}

/** The spot with the suggested changes laid over it. Everything not suggested stays as it was. */
export function applyChanges(spot: SafeParkingSpot, changes: SpotChanges): SafeParkingSpot {
  return { ...spot, ...changes };
}
