import type { Activity } from './driver-hours';
import { consentText, statusToShare } from './hours-share';

const H = 3_600_000;
const t0 = Date.UTC(2026, 9, 9, 6, 0, 0);
const options = { rules: 'assimilated_eu' } as const;

describe('statusToShare', () => {
  it('shares nothing when the driver is not on a shift, or is resting', () => {
    expect(statusToShare([], options, t0)).toBeNull();
    const finished: Activity[] = [{ kind: 'driving', start: t0, end: t0 + H }];
    expect(statusToShare(finished, options, t0 + 2 * H)).toBeNull();
    const resting: Activity[] = [{ kind: 'rest', start: t0 }];
    expect(statusToShare(resting, options, t0 + H)).toBeNull();
  });

  it('shares the state and whole minutes of driving left before the next break', () => {
    const log: Activity[] = [{ kind: 'driving', start: t0 }];
    expect(statusToShare(log, options, t0 + 3 * H + 30_000)).toEqual({
      state: 'driving',
      drivingLeftMin: 89,
      next: 'break',
      breakMin: 45,
      stretchMin: 270,
      untilLimitMin: expect.any(Number),
    });
  });

  it('names the state: a break, and other work', () => {
    const onBreak: Activity[] = [
      { kind: 'driving', start: t0, end: t0 + 2 * H },
      { kind: 'break', start: t0 + 2 * H },
    ];
    expect(statusToShare(onBreak, options, t0 + 2.5 * H)?.state).toBe('on_break');
    const working: Activity[] = [{ kind: 'other_work', start: t0 }];
    expect(statusToShare(working, options, t0 + H)?.state).toBe('working');
  });

  it('says a limit comes first when the day’s driving runs out before a break', () => {
    const log: Activity[] = [
      { kind: 'driving', start: t0, end: t0 + 4 * H },
      { kind: 'break', start: t0 + 4 * H, end: t0 + 4.75 * H },
      { kind: 'driving', start: t0 + 4.75 * H, end: t0 + 8.5 * H },
      { kind: 'break', start: t0 + 8.5 * H, end: t0 + 9.25 * H },
      { kind: 'driving', start: t0 + 9.25 * H },
    ];
    const status = statusToShare(log, options, t0 + 9.5 * H);
    expect(status?.next).toBe('limit');
  });
});

describe('the break figures', () => {
  it('give the rule’s break and stretch, and the driving left before a rest', () => {
    const log: Activity[] = [{ kind: 'driving', start: t0 }];
    const shared = statusToShare(log, options, t0 + 3 * H);
    expect(shared?.breakMin).toBe(45);
    expect(shared?.stretchMin).toBe(270);
    // A 9 hour day with 3 hours driven leaves 6 hours.
    expect(shared?.untilLimitMin).toBe(360);
  });

  it('say there is no break rule where the rule set has none', () => {
    const log: Activity[] = [{ kind: 'driving', start: t0 }];
    const shared = statusToShare(log, { rules: 'gb_domestic' }, t0 + 3 * H);
    expect(shared?.breakMin).toBe(0);
    expect(shared?.stretchMin).toBe(0);
  });
});

describe('consentText', () => {
  it('names the company, says it is the driver’s choice, and that the tachograph is the legal record', () => {
    const text = consentText('Acme Haulage');
    expect(text.title).toBe('Share your driving status with Acme Haulage?');
    expect(text.body).toContain('This is your choice');
    expect(text.body).toContain('legal record');
    expect(text.body).toContain('while you are on one of their jobs');
  });
});
