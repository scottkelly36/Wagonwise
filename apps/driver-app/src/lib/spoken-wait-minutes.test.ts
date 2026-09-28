import {
  DEFAULT_WAIT_MINUTES,
  parseSpokenWaitMinutes,
  toWaitPreset,
  WAIT_MINUTES_PRESETS,
} from './spoken-wait-minutes';

describe('parseSpokenWaitMinutes', () => {
  it.each([
    ['20 minutes', 20],
    ['about 20 mins', 20],
    ['twenty minutes', 20],
    ['twenty five minutes', 25],
    ['twenty-five minutes', 25],
    ['five minutes', 5],
    ['a minute', 1],
    ['about 10', 10],
    ['maybe forty', 40],
    ['an hour', 60],
    ['about an hour', 60],
    ['one hour', 60],
    ['2 hours', 120],
    ['two hours', 120],
    ['half an hour', 30],
    ['quarter of an hour', 15],
    ['an hour and a half', 90],
    ['hour and a half', 90],
    ['Twenty Minutes.', 20],
  ])('%s → %i', (transcript, expected) => {
    expect(parseSpokenWaitMinutes(transcript)).toBe(expected);
  });

  it.each(["don't know", 'not sure', 'dunno, bad though', '', 'a long time'])(
    '%s → undefined',
    (transcript) => {
      expect(parseSpokenWaitMinutes(transcript)).toBeUndefined();
    },
  );
});

describe('toWaitPreset', () => {
  it('returns every preset unchanged', () => {
    for (const preset of WAIT_MINUTES_PRESETS) {
      expect(toWaitPreset(preset)).toBe(preset);
    }
  });

  it.each([
    [1, 5],
    [8, 5],
    [12, 15],
    [20, 15],
    [25, 30],
    [40, 30],
    [50, 60],
    [120, 60],
  ])('%i minutes → %i', (minutes, expected) => {
    expect(toWaitPreset(minutes)).toBe(expected);
  });

  it('rounds a tie up to the longer wait', () => {
    expect(toWaitPreset(10)).toBe(15);
    expect(toWaitPreset(45)).toBe(60);
  });

  it('falls back to the default when nothing was understood', () => {
    expect(toWaitPreset(undefined)).toBe(DEFAULT_WAIT_MINUTES);
    expect(toWaitPreset(0)).toBe(DEFAULT_WAIT_MINUTES);
    expect(toWaitPreset(Number.NaN)).toBe(DEFAULT_WAIT_MINUTES);
  });
});
