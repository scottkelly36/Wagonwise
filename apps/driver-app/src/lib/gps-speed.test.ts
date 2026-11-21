import { gpsSpeedLabel, gpsSpeedReading, speedAfterSilence, speedUnitFor } from './gps-speed';

describe('gpsSpeedReading', () => {
  it('turns metres per second into whole miles per hour', () => {
    expect(gpsSpeedReading(20, 'mph')).toEqual({ value: 45, unit: 'mph' }); // 44.7
    expect(gpsSpeedReading(26.8, 'mph')).toEqual({ value: 60, unit: 'mph' });
  });

  it('turns metres per second into whole kilometres per hour', () => {
    expect(gpsSpeedReading(20, 'kph')).toEqual({ value: 72, unit: 'kph' });
  });

  it('shows 0 for GPS noise while standing still, not 1', () => {
    expect(gpsSpeedReading(0, 'mph')).toEqual({ value: 0, unit: 'mph' });
    expect(gpsSpeedReading(0.4, 'mph')).toEqual({ value: 0, unit: 'mph' });
    expect(gpsSpeedReading(0.6, 'mph')).toEqual({ value: 1, unit: 'mph' });
  });

  it('shows nothing when the phone has no usable speed', () => {
    expect(gpsSpeedReading(null, 'mph')).toBeUndefined();
    expect(gpsSpeedReading(undefined, 'mph')).toBeUndefined();
    expect(gpsSpeedReading(-1, 'mph')).toBeUndefined(); // some phones send -1 for "unknown"
    expect(gpsSpeedReading(Number.NaN, 'mph')).toBeUndefined();
    expect(gpsSpeedReading(Number.POSITIVE_INFINITY, 'mph')).toBeUndefined();
  });
});

describe('speedUnitFor', () => {
  it('follows the sign beside the box: km/h only for a km/h sign', () => {
    expect(speedUnitFor({ kind: 'limit-kph', kph: 80 })).toBe('kph');
    expect(speedUnitFor({ kind: 'limit', mph: 50 })).toBe('mph');
    expect(speedUnitFor({ kind: 'national' })).toBe('mph');
    expect(speedUnitFor(undefined)).toBe('mph');
  });
});

describe('speedAfterSilence', () => {
  it('takes a lorry that was nearly stopped to be stopped (the phone sends no fixes while it stands still)', () => {
    expect(speedAfterSilence(0)).toBe(0);
    expect(speedAfterSilence(2.5)).toBe(0);
  });

  it('hides the speed when a moving lorry stops reporting, rather than guess', () => {
    expect(speedAfterSilence(3)).toBeUndefined();
    expect(speedAfterSilence(20)).toBeUndefined();
    expect(speedAfterSilence(undefined)).toBeUndefined();
  });
});

describe('gpsSpeedLabel', () => {
  it('says it is the GPS speed and may differ from the speedometer', () => {
    expect(gpsSpeedLabel({ value: 47, unit: 'mph' })).toBe(
      'Your speed from GPS: 47 miles per hour. This can differ from the speedometer.',
    );
    expect(gpsSpeedLabel({ value: 80, unit: 'kph' })).toContain('80 kilometres per hour');
  });
});
