import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { SafeParkingSpot, SafeParkingSpotId } from '../domain/safe-parking-spot.js';
import {
  applyChanges,
  checkSuggestion,
  MAX_WAITING_PER_DRIVER,
  type InvalidSuggestion,
  type SpotChanges,
  type SpotSuggestion,
  type SuggestionId,
} from '../domain/spot-suggestion.js';
import type { Forbidden, StaffCaller } from './admin-parking.js';
import type { SafeParkingSpotNotFound } from './delete-safe-parking-spot.js';
import type { ParkingRepository } from './ports/parking-repository.js';

export type SuggestionNotFound = TaggedError<'SuggestionNotFound'>;
export type TooManySuggestions = TaggedError<'TooManySuggestions'>;

export interface SpotSuggestionDeps {
  readonly repo: ParkingRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** What suggesting needs, so a report landing on an existing place can use it with just these parts of the repository. */
export interface SuggestSpotEditDeps {
  readonly repo: Pick<ParkingRepository, 'find' | 'countSuggestionsBy' | 'saveSuggestion'>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * A driver suggests a change to a spot, or says it is closed or gone. It waits for WagonWise staff; nothing on the map changes
 * yet. A second suggestion from the same driver for the same place replaces the first, and a driver can have only so many
 * waiting at once.
 */
export async function suggestSpotEdit(
  deps: SuggestSpotEditDeps,
  input: {
    readonly spotId: SafeParkingSpotId;
    readonly suggesterId: string;
    readonly gone: boolean;
    readonly changes: SpotChanges;
  },
): Promise<Result<void, SafeParkingSpotNotFound | InvalidSuggestion | TooManySuggestions>> {
  const spot = await deps.repo.find(input.spotId);
  if (spot === null) return err({ tag: 'SafeParkingSpotNotFound' });
  const checked = checkSuggestion(spot, input);
  if (!checked.ok) return checked;
  if (
    (await deps.repo.countSuggestionsBy(input.suggesterId, input.spotId)) >= MAX_WAITING_PER_DRIVER
  ) {
    return err({ tag: 'TooManySuggestions' });
  }
  await deps.repo.saveSuggestion({
    id: makeId<'SpotSuggestionId'>(deps.ids.newId()),
    spotId: input.spotId,
    suggesterId: input.suggesterId,
    gone: checked.value.gone,
    changes: checked.value.changes,
    suggestedAt: deps.clock.now(),
  });
  return ok(undefined);
}

export interface WaitingSuggestion {
  readonly suggestion: SpotSuggestion;
  readonly spot: SafeParkingSpot;
}

/** The suggestions waiting, oldest first, each with the spot as it is now. WagonWise staff only. */
export async function listSuggestions(
  deps: Pick<SpotSuggestionDeps, 'repo'>,
  caller: StaffCaller,
): Promise<Result<WaitingSuggestion[], Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return ok(await deps.repo.listSuggestions(200));
}

/** Staff accept a suggestion: the changes are laid over the spot (or the spot is deleted, if it was reported gone). */
export async function approveSuggestion(
  deps: Pick<SpotSuggestionDeps, 'repo'>,
  caller: StaffCaller,
  id: SuggestionId,
): Promise<Result<void, Forbidden | SuggestionNotFound>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const suggestion = await deps.repo.findSuggestion(id);
  if (suggestion === null) return err({ tag: 'SuggestionNotFound' });
  if (suggestion.gone) {
    // Deleting the spot takes every suggestion about it with it.
    await deps.repo.deleteAny(suggestion.spotId);
    return ok(undefined);
  }
  const spot = await deps.repo.find(suggestion.spotId);
  if (spot !== null) await deps.repo.update(applyChanges(spot, suggestion.changes));
  await deps.repo.deleteSuggestion(id);
  return ok(undefined);
}

/** Staff turn a suggestion down. It is deleted; the spot is untouched. */
export async function rejectSuggestion(
  deps: Pick<SpotSuggestionDeps, 'repo'>,
  caller: StaffCaller,
  id: SuggestionId,
): Promise<Result<void, Forbidden | SuggestionNotFound>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return (await deps.repo.deleteSuggestion(id))
    ? ok(undefined)
    : err({ tag: 'SuggestionNotFound' });
}

/** When a driver deletes their account: their waiting suggestions go. Safe to run twice. */
export async function eraseSuggestionsBy(
  deps: Pick<SpotSuggestionDeps, 'repo'>,
  suggesterId: string,
): Promise<void> {
  await deps.repo.deleteSuggestionsBy(suggesterId);
}
