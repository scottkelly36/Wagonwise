import { currentActivity, KEEP_MS, switchActivity } from './shift-log';

const t = 1_800_000_000_000;

describe('switchActivity', () => {
  it('starts an activity, then ends it when the next begins', () => {
    const a = switchActivity([], 'driving', t);
    expect(a).toEqual([{ kind: 'driving', start: t }]);
    const b = switchActivity(a, 'break', t + 1000);
    expect(b).toEqual([
      { kind: 'driving', start: t, end: t + 1000 },
      { kind: 'break', start: t + 1000 },
    ]);
    expect(currentActivity(b)?.kind).toBe('break');
  });

  it('changes nothing when the same activity is chosen again', () => {
    const a = switchActivity([], 'driving', t);
    expect(switchActivity(a, 'driving', t + 5000)).toEqual(a);
  });

  it('finish ends the current activity and starts none', () => {
    const b = switchActivity(switchActivity([], 'driving', t), 'finish', t + 1000);
    expect(b).toEqual([{ kind: 'driving', start: t, end: t + 1000 }]);
    expect(currentActivity(b)).toBeUndefined();
  });

  it('drops records older than it keeps', () => {
    const old = [{ kind: 'driving' as const, start: t - KEEP_MS - 2000, end: t - KEEP_MS - 1000 }];
    expect(switchActivity(old, 'driving', t)).toEqual([{ kind: 'driving', start: t }]);
  });
});
