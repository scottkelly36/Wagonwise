import { breakNoticeKey, breakNoticeSpeech, BREAK_SOON_MS, spokenDuration } from './break-notice';
import type { BreakPlan } from './break-plan';

const plan = (overrides: Partial<BreakPlan>): BreakPlan => ({
  kind: 'break',
  breaks: 1,
  firstStopInMs: 60 * 60_000,
  arrivalMs: 0,
  firstStopFraction: 0.5,
  ...overrides,
});

describe('breakNoticeKey', () => {
  it('has no key when no break is needed', () => {
    expect(breakNoticeKey(plan({ kind: 'none', firstStopInMs: null }))).toBeUndefined();
  });

  it('changes when the break becomes near, or becomes a rest', () => {
    const later = breakNoticeKey(plan({ firstStopInMs: BREAK_SOON_MS + 1 }));
    const soon = breakNoticeKey(plan({ firstStopInMs: BREAK_SOON_MS }));
    const limit = breakNoticeKey(plan({ kind: 'limit', firstStopInMs: 3 * 60 * 60_000 }));
    expect(new Set([later, soon, limit]).size).toBe(3);
  });

  it('stays the same as the minutes tick down within a band', () => {
    expect(breakNoticeKey(plan({ firstStopInMs: 50 * 60_000 }))).toBe(
      breakNoticeKey(plan({ firstStopInMs: 49 * 60_000 })),
    );
  });
});

describe('breakNoticeSpeech', () => {
  it('says what is needed and when', () => {
    expect(breakNoticeSpeech(plan({ kind: 'limit' }))).toBe('Rest needed before you arrive.');
    expect(breakNoticeSpeech(plan({ firstStopInMs: 12 * 60_000 }))).toBe(
      'Break needed in 12 minutes.',
    );
    expect(breakNoticeSpeech(plan({ firstStopInMs: 65 * 60_000 }))).toBe(
      'Break needed in 1 hour 5 minutes.',
    );
  });
});

describe('spokenDuration', () => {
  it('says hours and minutes in words', () => {
    expect(spokenDuration(60_000)).toBe('1 minute');
    expect(spokenDuration(60 * 60_000)).toBe('1 hour');
    expect(spokenDuration(150 * 60_000)).toBe('2 hours 30 minutes');
  });
});
