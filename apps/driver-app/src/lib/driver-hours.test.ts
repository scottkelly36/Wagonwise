import { breakDueAt, durationText, hoursStatus, type Activity } from './driver-hours';

const H = 3_600_000;
const M = 60_000;
const t0 = Date.UTC(2026, 9, 9, 6, 0, 0);
const eu = { rules: 'assimilated_eu' } as const;
const gb = { rules: 'gb_domestic' } as const;
const drive = (fromH: number, toH?: number): Activity => ({
  kind: 'driving',
  start: t0 + fromH * H,
  end: toH === undefined ? undefined : t0 + toH * H,
});
const rest = (fromH: number, toH: number, kind: Activity['kind'] = 'break'): Activity => ({
  kind,
  start: t0 + fromH * H,
  end: t0 + toH * H,
});

describe('assimilated EU rules', () => {
  it('counts down 4h30 of driving to the break', () => {
    const s = hoursStatus([drive(0)], t0 + 2 * H, eu);
    expect(s.state).toBe('driving');
    expect(s.drivingSinceBreakMs).toBe(2 * H);
    expect(s.untilBreakMs).toBe(2.5 * H);
    expect(s.next).toBe('break');
    expect(s.drivingLeftMs).toBe(2.5 * H);
  });

  it('is at zero once 4h30 is reached, and stays at zero', () => {
    expect(hoursStatus([drive(0)], t0 + 4.5 * H, eu).untilBreakMs).toBe(0);
    expect(hoursStatus([drive(0)], t0 + 6 * H, eu).untilBreakMs).toBe(0);
  });

  it('resets after one break of 45 minutes', () => {
    const s = hoursStatus([drive(0, 4), rest(4, 4.75), drive(4.75)], t0 + 5.75 * H, eu);
    expect(s.drivingSinceBreakMs).toBe(1 * H);
    expect(s.untilBreakMs).toBe(3.5 * H);
    expect(s.dailyDrivingMs).toBe(5 * H);
  });

  it('does not reset after a break of 44 minutes', () => {
    const s = hoursStatus([drive(0, 4), rest(4, 4 + 44 / 60), drive(4 + 44 / 60)], t0 + 5 * H, eu);
    expect(s.drivingSinceBreakMs).toBeGreaterThan(4 * H);
  });

  it('accepts 15 minutes then 30, in that order', () => {
    const ok = hoursStatus(
      [drive(0, 2), rest(2, 2.25), drive(2.25, 4), rest(4, 4.5), drive(4.5)],
      t0 + 5 * H,
      eu,
    );
    expect(ok.drivingSinceBreakMs).toBe(0.5 * H);
  });

  it('does not accept 30 minutes then 15', () => {
    const s = hoursStatus(
      [drive(0, 2), rest(2, 2.5), drive(2.5, 4), rest(4, 4.25), drive(4.25)],
      t0 + 5 * H,
      eu,
    );
    // The 30 minutes counted as the first part; the later 15 is not the second, so 4h15 is still on the clock.
    expect(s.drivingSinceBreakMs).toBe(4.25 * H);
  });

  it('does not count other work as a break, but counts time not recorded as one', () => {
    const work = hoursStatus([drive(0, 3), rest(3, 4, 'other_work'), drive(4)], t0 + 5 * H, eu);
    expect(work.drivingSinceBreakMs).toBe(4 * H);
    const gap = hoursStatus([drive(0, 3), drive(4)], t0 + 5 * H, eu);
    expect(gap.drivingSinceBreakMs).toBe(1 * H);
  });

  it('stops at 9 hours a day, or 10 when an extension is left', () => {
    const day = [drive(0, 4.5), rest(4.5, 5.25), drive(5.25, 9.75), rest(9.75, 10.5), drive(10.5)];
    const s = hoursStatus(day, t0 + 11 * H, eu);
    expect(s.dailyDrivingMs).toBe(9.5 * H);
    expect(s.dailyLimitMs).toBe(9 * H);
    expect(s.untilDailyLimitMs).toBe(0);
    const ext = hoursStatus(day, t0 + 11 * H, { ...eu, extensionsLeft: 1 });
    expect(ext.dailyLimitMs).toBe(10 * H);
    expect(ext.untilDailyLimitMs).toBe(0.5 * H);
  });

  it('starts a new day after a rest of 9 hours or more', () => {
    const s = hoursStatus([drive(0, 4), rest(4, 13, 'rest'), drive(13)], t0 + 14 * H, eu);
    expect(s.dailyDrivingMs).toBe(1 * H);
    expect(s.drivingSinceBreakMs).toBe(1 * H);
  });

  it('says which limit comes first', () => {
    const s = hoursStatus(
      [drive(0, 4), rest(4, 4.75), drive(4.75, 6), rest(6, 6.75), drive(6.75, 9.5)],
      t0 + 9.5 * H,
      eu,
    );
    expect(s.dailyDrivingMs).toBe(8 * H);
    expect(s.next).toBe('daily_limit');
    expect(s.drivingLeftMs).toBe(1 * H);
    expect(breakDueAt(s, t0 + 9.5 * H)).toBe(t0 + 10.5 * H);
  });

  it('is idle with nothing recorded, and on a break while on one', () => {
    expect(hoursStatus([], t0, eu).state).toBe('idle');
    expect(hoursStatus([drive(0, 4), rest(4, 5)], t0 + 4.5 * H, eu).state).toBe('on_break');
  });
});

describe('GB domestic rules', () => {
  it('gives the 10 hour driving limit and no break countdown', () => {
    const s = hoursStatus([drive(0)], t0 + 3 * H, gb);
    expect(s.untilBreakMs).toBeNull();
    expect(s.dailyLimitMs).toBe(10 * H);
    expect(s.untilDailyLimitMs).toBe(7 * H);
    expect(s.next).toBe('daily_limit');
  });
});

describe('durationText', () => {
  it('reads as hours and minutes', () => {
    expect(durationText(2 * H + 5 * M)).toBe('2h 05m');
    expect(durationText(45 * M)).toBe('45m');
    expect(durationText(-1)).toBe('0m');
  });
});
