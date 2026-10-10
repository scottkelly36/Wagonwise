import type { TachographSnapshot } from './snapshot';
import { tachographToHoursStatus } from './to-hours-status';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const options = { rules: 'assimilated_eu' } as const;

const snapshot = (extra: Partial<TachographSnapshot> = {}): TachographSnapshot => ({
  at: Date.UTC(2026, 9, 10, 10, 0),
  consent: 'given',
  workingState: 'drive',
  continuousDrivingMin: 150, // 2h 30m since the last break
  cumulativeBreakMin: 0,
  dailyDrivingMin: 200, // 3h 20m today
  weeklyDrivingMin: 1_500, // 25h this week
  previousAndCurrentWeekDrivingMin: 3_000, // 50h in the two weeks
  ...extra,
});

describe('tachographToHoursStatus', () => {
  it('gives the same status the clock uses, from the unit’s own counters', () => {
    const result = tachographToHoursStatus(snapshot(), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.status;
    expect(s.state).toBe('driving');
    expect(s.drivingSinceBreakMs).toBe(150 * MINUTE);
    // EU rules: a break after 4h 30m of driving, 9 hours a day, 56 a week, 90 in two.
    expect(s.untilBreakMs).toBe(2 * HOUR);
    expect(s.dailyDrivingMs).toBe(200 * MINUTE);
    expect(s.untilDailyLimitMs).toBe(9 * HOUR - 200 * MINUTE);
    expect(s.weeklyDrivingMs).toBe(25 * HOUR);
    expect(s.untilWeeklyLimitMs).toBe(31 * HOUR);
    expect(s.fortnightDrivingMs).toBe(50 * HOUR);
    expect(s.untilFortnightLimitMs).toBe(40 * HOUR);
    expect(s.next).toBe('break');
    expect(s.drivingLeftMs).toBe(2 * HOUR);
  });

  it('says a limit comes before the break when the day’s driving is nearly used', () => {
    const result = tachographToHoursStatus(
      snapshot({ continuousDrivingMin: 30, dailyDrivingMin: 8 * 60 + 40 }),
      options,
    );
    expect(result.ok && result.status.next).toBe('limit');
    expect(result.ok && result.status.drivingLeftMs).toBe(20 * MINUTE);
    expect(result.ok && result.status.limit).toBe('daily');
  });

  it('uses the ten hour day only when the driver still has one to use', () => {
    const base = snapshot({ dailyDrivingMin: 9 * 60 });
    const nine = tachographToHoursStatus(base, options);
    const ten = tachographToHoursStatus(base, { ...options, extensionsLeft: 1 });
    expect(nine.ok && nine.status.untilDailyLimitMs).toBe(0);
    expect(ten.ok && ten.status.untilDailyLimitMs).toBe(HOUR);
  });

  it('maps what the driver is doing, counting availability as work and never as a break', () => {
    const state = (workingState: TachographSnapshot['workingState']) => {
      const r = tachographToHoursStatus(snapshot({ workingState }), options);
      return r.ok ? r.status.state : r.reason;
    };
    expect(state('drive')).toBe('driving');
    expect(state('work')).toBe('working');
    expect(state('available')).toBe('working');
    expect(state('rest')).toBe('on_break');
  });

  it('is incomplete, naming what is missing, rather than guessing a figure the unit did not give', () => {
    const result = tachographToHoursStatus(
      snapshot({ dailyDrivingMin: undefined, weeklyDrivingMin: undefined }),
      options,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'incomplete',
      missing: ['currentDailyDrivingTime', 'currentWeeklyDrivingTime'],
    });
    const noState = tachographToHoursStatus(snapshot({ workingState: undefined }), options);
    expect(noState.ok).toBe(false);
  });

  it('says so when the driver has not given consent', () => {
    expect(tachographToHoursStatus(snapshot({ consent: 'withheld' }), options)).toEqual({
      ok: false,
      reason: 'no_consent',
      missing: [],
    });
  });

  it('works the earlier week out as the difference between the two weeks and this one', () => {
    const result = tachographToHoursStatus(
      snapshot({ weeklyDrivingMin: 60 * 20, previousAndCurrentWeekDrivingMin: 60 * 55 }),
      options,
    );
    expect(result.ok && result.status.fortnightDrivingMs).toBe(55 * HOUR);
  });
});
