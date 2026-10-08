import type { SavedPlaceDto } from '@wagonwise/contracts/places';

import { normalisePostcode } from './postcodes';

export type StopKind = 'pickup' | 'delivery';
export type StopSource = 'saved' | 'new';

/** One stop on the job form, as the dispatcher has filled it in so far. */
export interface StopDraft {
  /** Identifies the row across reordering, so a field keeps its focus and its lookup. */
  readonly key: string;
  readonly kind: StopKind;
  /** `undefined` means "not chosen": a stored location when the company has any, otherwise a new address. */
  readonly source: StopSource | undefined;
  /** The stored location chosen, or (for a new address) a marked entrance picked near its postcode. */
  readonly place: SavedPlaceDto | undefined;
  readonly name: string;
  readonly postcode: string;
  /** For a new address: keep it as a stored location for next time. */
  readonly save: boolean;
}

export function newStopDraft(kind: StopKind): StopDraft {
  return {
    key: crypto.randomUUID(),
    kind,
    source: undefined,
    place: undefined,
    name: '',
    postcode: '',
    save: true,
  };
}

/** The stops a fresh form starts with: a collection then a delivery, or whatever shape the last job had. */
export function defaultStops(kinds: readonly StopKind[] = ['pickup', 'delivery']): StopDraft[] {
  return kinds.map(newStopDraft);
}

export function effectiveSource(stop: Pick<StopDraft, 'source'>, storedCount: number): StopSource {
  return stop.source ?? (storedCount > 0 ? 'saved' : 'new');
}

export interface StopProblems {
  readonly place?: string;
  readonly name?: string;
  readonly postcode?: string;
}

/** What is still missing on a stop. A stored location only needs choosing; a new address needs a name and a
 *  postcode that looks like one. */
export function stopProblems(stop: StopDraft, storedCount: number): StopProblems {
  if (effectiveSource(stop, storedCount) === 'saved') {
    return stop.place === undefined
      ? { place: 'Choose a stored location, or switch to New address.' }
      : {};
  }
  const problems: { name?: string; postcode?: string } = {};
  if (stop.name.trim() === '') {
    problems.name =
      stop.kind === 'pickup'
        ? 'Enter where the load is collected from.'
        : 'Enter where the load is going.';
  }
  if (stop.postcode.trim() === '') problems.postcode = 'Enter the postcode.';
  else if (normalisePostcode(stop.postcode) === undefined) {
    problems.postcode = 'That does not look like a UK postcode. It should be like NE46 3JA.';
  }
  return problems;
}

/** The whole list: what stops the job being created, or nothing. A job needs a delivery; a collection is
 *  optional. */
export function stopsProblem(stops: readonly StopDraft[], storedCount: number): string | undefined {
  if (!stops.some((s) => s.kind === 'delivery')) return 'Add at least one delivery.';
  const incomplete = stops.some((s) => Object.keys(stopProblems(s, storedCount)).length > 0);
  return incomplete ? 'Finish every stop, or remove the ones you do not need.' : undefined;
}

/** The list with the stop at `index` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveStop<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}
