import type { SavedPlaceDto } from '@wagonwise/contracts/places';
import { describe, expect, it } from 'vitest';
import {
  defaultStops,
  effectiveSource,
  moveStop,
  newStopDraft,
  stopProblems,
  stopsProblem,
} from './job-stops';

const place = { id: 'p1', name: 'Hexham Mart', location: { lat: 1, lon: 1 } } as SavedPlaceDto;

describe('effectiveSource', () => {
  it('starts on a stored location once the company has any, otherwise a new address', () => {
    expect(effectiveSource({ source: undefined }, 3)).toBe('saved');
    expect(effectiveSource({ source: undefined }, 0)).toBe('new');
    expect(effectiveSource({ source: 'new' }, 3)).toBe('new');
  });
});

describe('stopProblems', () => {
  it('needs a stored location to be chosen', () => {
    const stop = { ...newStopDraft('delivery'), source: 'saved' as const };
    expect(stopProblems(stop, 2).place).toBeDefined();
    expect(stopProblems({ ...stop, place }, 2)).toEqual({});
  });

  it('needs a name and a real-looking postcode for a new address', () => {
    const stop = { ...newStopDraft('pickup'), source: 'new' as const };
    expect(stopProblems(stop, 0)).toMatchObject({
      name: expect.stringContaining('collected'),
      postcode: 'Enter the postcode.',
    });
    expect(stopProblems({ ...stop, name: 'Quarry', postcode: 'nonsense' }, 0).postcode).toMatch(
      /UK postcode/,
    );
    expect(stopProblems({ ...stop, name: 'Quarry', postcode: 'NE46 3JA' }, 0)).toEqual({});
  });
});

describe('stopsProblem', () => {
  const done = (kind: 'pickup' | 'delivery') => ({
    ...newStopDraft(kind),
    source: 'new' as const,
    name: 'Somewhere',
    postcode: 'NE46 3JA',
  });

  it('needs a delivery, and a collection is optional', () => {
    expect(stopsProblem([done('delivery')], 0)).toBeUndefined();
    expect(stopsProblem([done('pickup'), done('delivery')], 0)).toBeUndefined();
    expect(stopsProblem([done('pickup')], 0)).toBe('Add at least one delivery.');
    expect(stopsProblem([], 0)).toBe('Add at least one delivery.');
  });

  it('asks for every stop to be finished', () => {
    expect(stopsProblem([done('pickup'), newStopDraft('delivery')], 0)).toMatch(
      /Finish every stop/,
    );
  });
});

describe('moveStop and defaultStops', () => {
  it('moves a stop up or down, and leaves the ends alone', () => {
    expect(moveStop(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveStop(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveStop(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveStop(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('starts a form with a collection and a delivery, or the shape of the last job', () => {
    expect(defaultStops().map((s) => s.kind)).toEqual(['pickup', 'delivery']);
    expect(defaultStops(['delivery', 'delivery']).map((s) => s.kind)).toEqual([
      'delivery',
      'delivery',
    ]);
    expect(new Set(defaultStops().map((s) => s.key)).size).toBe(2);
  });
});
