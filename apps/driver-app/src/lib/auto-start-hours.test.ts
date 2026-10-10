import { decideAutoStart, parseStartPreference } from './auto-start-hours';

describe('decideAutoStart', () => {
  it('starts the clock when the driver chose that, whatever it said before', () => {
    expect(decideAutoStart('always', undefined)).toBe('start');
    expect(decideAutoStart('always', 'other_work')).toBe('start');
    expect(decideAutoStart('always', 'break')).toBe('start');
    expect(decideAutoStart('always', 'rest')).toBe('start');
  });

  it('does nothing when the driver is already on Driving', () => {
    for (const preference of ['ask', 'always', 'never'] as const) {
      expect(decideAutoStart(preference, 'driving')).toBe('nothing');
    }
  });

  it('asks only when no shift is on and the driver has not decided', () => {
    expect(decideAutoStart('ask', undefined)).toBe('ask');
    expect(decideAutoStart('ask', 'break')).toBe('nothing');
    expect(decideAutoStart('ask', 'other_work')).toBe('nothing');
  });

  it('leaves it to the buttons when the driver said not to', () => {
    expect(decideAutoStart('never', undefined)).toBe('nothing');
    expect(decideAutoStart('never', 'break')).toBe('nothing');
  });
});

describe('parseStartPreference', () => {
  it('reads a saved choice, and asks when it is unrecognised or missing', () => {
    expect(parseStartPreference('always')).toBe('always');
    expect(parseStartPreference('never')).toBe('never');
    expect(parseStartPreference('ask')).toBe('ask');
    expect(parseStartPreference('sometimes')).toBe('ask');
    expect(parseStartPreference(undefined)).toBe('ask');
    expect(parseStartPreference(null)).toBe('ask');
  });
});
