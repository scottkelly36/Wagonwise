import { describe, expect, it } from 'vitest';
import { isWorthKeeping, MAX_LANE_CLOSURE_DAYS, middleOf, type Closure } from './closure.js';

/** Only what `isWorthKeeping` reads; the domain's tests do not reach into the application layer for a fixture. */
const closure = (overrides: Pick<Closure, 'kind' | 'startsAt' | 'endsAt'>) => overrides;

const day = (n: number) => n * 24 * 60 * 60 * 1000;

describe('isWorthKeeping', () => {
  it('keeps every full closure, however long it runs', () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    expect(
      isWorthKeeping(
        closure({ kind: 'full', startsAt: start, endsAt: new Date(+start + day(600)) }),
      ),
    ).toBe(true);
  });

  it('keeps a lane closure only while it is short', () => {
    const start = new Date('2026-11-01T00:00:00.000Z');
    const lane = (days: number) =>
      closure({ kind: 'lane', startsAt: start, endsAt: new Date(+start + day(days)) });
    expect(isWorthKeeping(lane(1))).toBe(true);
    expect(isWorthKeeping(lane(MAX_LANE_CLOSURE_DAYS))).toBe(true);
    expect(isWorthKeeping(lane(MAX_LANE_CLOSURE_DAYS + 0.01))).toBe(false);
    expect(isWorthKeeping(lane(400))).toBe(false);
  });
});

describe('middleOf', () => {
  it('is a vertex of the line, so the marker sits on the road', () => {
    const line = [
      { lat: 1, lon: 1 },
      { lat: 2, lon: 2 },
      { lat: 3, lon: 3 },
    ];
    expect(middleOf(line)).toEqual({ lat: 2, lon: 2 });
    expect(middleOf([{ lat: 1, lon: 1 }])).toEqual({ lat: 1, lon: 1 });
    expect(middleOf([])).toBeUndefined();
  });
});
