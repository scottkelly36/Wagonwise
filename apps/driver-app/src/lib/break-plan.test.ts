import { hoursStatus, type Activity } from './driver-hours';
import { parkingBeforeStop, planBreak } from './break-plan';

const H = 3_600_000;
const t0 = Date.UTC(2026, 9, 9, 6, 0, 0);
const driving = (fromH: number, toH?: number): Activity => ({
  kind: 'driving',
  start: t0 + fromH * H,
  end: toH === undefined ? undefined : t0 + toH * H,
});
const eu = (log: Activity[], atH: number) =>
  hoursStatus(log, t0 + atH * H, { rules: 'assimilated_eu' });

describe('planBreak', () => {
  it('needs nothing when the route fits in the time left', () => {
    const plan = planBreak(eu([driving(0)], 1), 'assimilated_eu', 120, t0 + 1 * H);
    expect(plan).toMatchObject({ kind: 'none', breaks: 0, firstStopInMs: null });
    expect(plan.arrivalMs).toBe(t0 + 3 * H);
  });

  it('puts one 45 minute break into the arrival when the stretch runs out on the way', () => {
    const now = t0 + 3 * H; // 3h driven, 1h30 until the break
    const plan = planBreak(eu([driving(0)], 3), 'assimilated_eu', 180, now);
    expect(plan.kind).toBe('break');
    expect(plan.breaks).toBe(1);
    expect(plan.firstStopInMs).toBe(1.5 * H);
    expect(plan.arrivalMs).toBe(now + 3 * H + 0.75 * H);
    expect(plan.firstStopFraction).toBeCloseTo(0.5);
  });

  it('counts a second break on a long route', () => {
    // Nothing driven yet: 4h30 to the first break, then another 4h30 stretch. 8h needs one break, 9h needs two.
    expect(planBreak(eu([], 0), 'assimilated_eu', 8 * 60, t0).breaks).toBe(1);
    const nine = planBreak(
      hoursStatus([], t0, { rules: 'assimilated_eu', extensionsLeft: 1 }),
      'assimilated_eu',
      9.5 * 60,
      t0,
    );
    expect(nine.kind).toBe('break');
    expect(nine.breaks).toBe(2);
  });

  it('says so when the day’s driving limit is reached before the end', () => {
    const plan = planBreak(eu([driving(0)], 1), 'assimilated_eu', 9 * 60, t0 + H);
    expect(plan.kind).toBe('limit');
    expect(plan.arrivalMs).toBeNull();
    expect(plan.firstStopInMs).toBe(3.5 * H);
  });

  it('under GB domestic rules there is no break to plan, only the daily limit', () => {
    const status = hoursStatus([driving(0)], t0 + 2 * H, { rules: 'gb_domestic' });
    expect(planBreak(status, 'gb_domestic', 5 * 60, t0 + 2 * H).kind).toBe('none');
    expect(planBreak(status, 'gb_domestic', 9 * 60, t0 + 2 * H).kind).toBe('limit');
  });
});

describe('parkingBeforeStop', () => {
  // A straight route west to east along one latitude, 0 to 0.4 degrees of longitude.
  const line: [number, number][] = [
    [0, 55],
    [0.2, 55],
    [0.4, 55],
  ];
  const spot = (id: string, lon: number, lat = 55) => ({ id, location: { lat, lon } });
  const plan = {
    kind: 'break' as const,
    breaks: 1,
    firstStopInMs: 1,
    arrivalMs: 1,
    firstStopFraction: 0.5,
  };
  const start = { lat: 55, lon: 0 };

  it('offers spots ahead and before the limit, the one nearest the limit first', () => {
    const spots = [
      spot('early', 0.05),
      spot('mid', 0.15),
      spot('late', 0.35),
      spot('behind', -0.1),
    ];
    const found = parkingBeforeStop(spots, line, start, plan, 120);
    expect(found.map((f) => f.spot.id)).toEqual(['mid', 'early']);
    expect(found[0]?.minutes).toBeGreaterThan(40);
    expect(found[0]?.minutes).toBeLessThan(60);
  });

  it('leaves out a spot far from the route, and offers none when no stop is needed', () => {
    expect(parkingBeforeStop([spot('far', 0.15, 55.2)], line, start, plan, 120)).toEqual([]);
    const none = { ...plan, kind: 'none' as const, firstStopFraction: null };
    expect(parkingBeforeStop([spot('mid', 0.15)], line, start, none, 120)).toEqual([]);
  });
});
