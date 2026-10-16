import { breakExplanation } from './break-explanation';
import type { BreakPlan } from './break-plan';

const plan = (overrides: Partial<BreakPlan>): BreakPlan => ({
  kind: 'break',
  breaks: 1,
  firstStopInMs: 60 * 60_000,
  arrivalMs: 0,
  firstStopFraction: 0.5,
  ...overrides,
});

describe('breakExplanation', () => {
  it('says what a single break adds', () => {
    expect(breakExplanation(plan({ breaks: 1 }), 'assimilated_eu', 330)).toBe(
      'Driving takes 5 h 30 min. Your driving hours need a break of 45 min, so the journey is about 6 h 15 min in all.',
    );
  });

  it('says what several breaks add, with the rest in total', () => {
    expect(breakExplanation(plan({ breaks: 2 }), 'assimilated_eu', 605)).toBe(
      'Driving takes 10 h 5 min. Your driving hours need 2 breaks of 45 min (1 h 30 min of rest), so the journey is about 11 h 35 min in all.',
    );
  });

  it('says nothing when there is no break in the arrival', () => {
    expect(
      breakExplanation(plan({ kind: 'none', breaks: 0 }), 'assimilated_eu', 120),
    ).toBeUndefined();
    expect(
      breakExplanation(plan({ kind: 'limit', breaks: 0 }), 'assimilated_eu', 900),
    ).toBeUndefined();
  });

  it('says nothing under rules with no break to add', () => {
    expect(breakExplanation(plan({ breaks: 1 }), 'gb_domestic', 330)).toBeUndefined();
  });
});
