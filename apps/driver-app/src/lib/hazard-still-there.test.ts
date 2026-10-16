import {
  ASK_PAST_METRES,
  ASK_UNTIL_PAST_METRES,
  markAsked,
  MAX_QUESTIONS_PER_TRIP,
  NOTHING_PASSED,
  passedHazards,
  SEEN_AHEAD_METRES,
} from './hazard-still-there';

const ahead = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('passedHazards', () => {
  it('asks once a seen hazard is far enough behind, and not before', () => {
    let state = NOTHING_PASSED;
    // Seen ahead.
    ({ state } = passedHazards(state, ahead({ a: 400 }), 0));
    expect(state.seen.has('a')).toBe(true);
    // Just passed, not far enough.
    expect(passedHazards(state, ahead({ a: -(ASK_PAST_METRES - 1) }), 0).due).toEqual([]);
    // Far enough behind.
    expect(passedHazards(state, ahead({ a: -ASK_PAST_METRES }), 0).due).toEqual(['a']);
  });

  it('never asks about a hazard that was not seen coming (a trip started beyond it)', () => {
    expect(passedHazards(NOTHING_PASSED, ahead({ a: -300 }), 0).due).toEqual([]);
  });

  it('does not count a hazard seen too far ahead as seen', () => {
    const { state } = passedHazards(NOTHING_PASSED, ahead({ a: SEEN_AHEAD_METRES + 1 }), 0);
    expect(state.seen.has('a')).toBe(false);
  });

  it('lets the moment go: not asked once the driver is a long way past', () => {
    const { state } = passedHazards(NOTHING_PASSED, ahead({ a: 100 }), 0);
    expect(passedHazards(state, ahead({ a: -(ASK_UNTIL_PAST_METRES + 1) }), 0).due).toEqual([]);
  });

  it('never asks about the same hazard again', () => {
    let { state } = passedHazards(NOTHING_PASSED, ahead({ a: 100 }), 0);
    state = markAsked(state, 'a');
    expect(passedHazards(state, ahead({ a: -200 }), 1).due).toEqual([]);
  });

  it('asks the closest first and respects the trip limit', () => {
    let { state } = passedHazards(NOTHING_PASSED, ahead({ a: 100, b: 100, c: 100, d: 100 }), 0);
    const result = passedHazards(state, ahead({ a: -400, b: -200, c: -300, d: -500 }), 0);
    expect(result.due).toEqual(['b', 'c', 'a'].slice(0, MAX_QUESTIONS_PER_TRIP));
    state = result.state;
    expect(passedHazards(state, ahead({ a: -400, b: -200 }), 2).due).toEqual(['b']);
    expect(passedHazards(state, ahead({ a: -400, b: -200 }), 3).due).toEqual([]);
  });
});
