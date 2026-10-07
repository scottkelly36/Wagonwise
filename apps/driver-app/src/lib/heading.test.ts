import { facingDegrees, headingChangedEnough } from './heading';

describe('facingDegrees', () => {
  it('uses the GPS course while moving', () => {
    expect(facingDegrees({ gpsHeadingDeg: 90, speedMps: 12, compassDeg: 270 })).toBe(90);
  });

  it('uses the compass when stopped or crawling', () => {
    expect(facingDegrees({ gpsHeadingDeg: 90, speedMps: 0.3, compassDeg: 270 })).toBe(270);
    expect(facingDegrees({ gpsHeadingDeg: -1, speedMps: 0, compassDeg: 45 })).toBe(45);
  });

  it('falls back to the compass when moving but the GPS has no course', () => {
    expect(facingDegrees({ gpsHeadingDeg: -1, speedMps: 10, compassDeg: 180 })).toBe(180);
    expect(facingDegrees({ gpsHeadingDeg: null, speedMps: 10, compassDeg: 180 })).toBe(180);
  });

  it('gives nothing when neither is known', () => {
    expect(facingDegrees({ gpsHeadingDeg: undefined, speedMps: undefined, compassDeg: -1 })).toBe(
      undefined,
    );
  });

  it('rounds and keeps the result within 0 to 359', () => {
    expect(facingDegrees({ gpsHeadingDeg: 359.6, speedMps: 20, compassDeg: undefined })).toBe(0);
    expect(facingDegrees({ gpsHeadingDeg: undefined, speedMps: 0, compassDeg: 12.4 })).toBe(12);
  });
});

describe('headingChangedEnough', () => {
  it('ignores small changes and notices real ones', () => {
    expect(headingChangedEnough(100, 103)).toBe(false);
    expect(headingChangedEnough(100, 106)).toBe(true);
  });

  it('measures across the north wrap', () => {
    expect(headingChangedEnough(358, 2)).toBe(false);
    expect(headingChangedEnough(350, 10)).toBe(true);
  });

  it('notices a heading appearing or going', () => {
    expect(headingChangedEnough(undefined, 90)).toBe(true);
    expect(headingChangedEnough(90, undefined)).toBe(true);
    expect(headingChangedEnough(undefined, undefined)).toBe(false);
  });
});
