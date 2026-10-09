import { hoursStatus, type Activity } from './driver-hours';
import { quickSummary } from './hours-quick';

const H = 3_600_000;
const t0 = Date.UTC(2026, 9, 9, 6, 0, 0);
const options = { rules: 'assimilated_eu' } as const;
const at = (log: Activity[], ms: number) => quickSummary(hoursStatus(log, ms, options));

describe('quickSummary', () => {
  it('invites the driver to start when no shift is on', () => {
    expect(at([], t0)).toEqual({
      text: 'Driving hours · tap to start',
      urgent: false,
      running: false,
    });
  });

  it('says what they are doing and the driving left before the break', () => {
    const log: Activity[] = [{ kind: 'driving', start: t0 }];
    expect(at(log, t0 + 3 * H)).toEqual({
      text: 'Driving · 1h 30m to break',
      urgent: false,
      running: true,
    });
  });

  it('turns urgent under half an hour', () => {
    const log: Activity[] = [{ kind: 'driving', start: t0 }];
    expect(at(log, t0 + 4.25 * H).urgent).toBe(true);
  });

  it('names other work and a break', () => {
    expect(at([{ kind: 'other_work', start: t0 }], t0 + H).text).toMatch(/^Other work · /);
    const onBreak: Activity[] = [
      { kind: 'driving', start: t0, end: t0 + 2 * H },
      { kind: 'break', start: t0 + 2 * H },
    ];
    const s = at(onBreak, t0 + 2.25 * H);
    expect(s.text).toMatch(/^On a break · /);
    expect(s.urgent).toBe(false);
  });
});
