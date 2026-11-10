import {
  facingDegrees,
  facingFrom,
  headingChangedEnough,
  isMoving,
  smoothDegrees,
} from './heading';

describe('isMoving', () => {
  it('starts moving at 1.5 m/s but only stops again below 0.8 m/s', () => {
    expect(isMoving(false, 1.2)).toBe(false);
    expect(isMoving(false, 1.5)).toBe(true);
    expect(isMoving(true, 1.0)).toBe(true);
    expect(isMoving(true, 0.79)).toBe(false);
  });

  it('keeps the last answer when the speed is missing', () => {
    expect(isMoving(true, null)).toBe(true);
    expect(isMoving(false, undefined)).toBe(false);
  });
});

describe('facingFrom', () => {
  it('says whether the direction is the GPS course or the compass', () => {
    expect(facingFrom({ gpsHeadingDeg: 90, speedMps: 12, compassDeg: 270 })).toEqual({
      degrees: 90,
      source: 'gps',
    });
    expect(facingFrom({ gpsHeadingDeg: 90, speedMps: 0, compassDeg: 270 })).toEqual({
      degrees: 270,
      source: 'compass',
    });
  });

  it('takes the moving flag over the speed, so a crawl keeps its GPS course', () => {
    const crawling = { gpsHeadingDeg: 90, speedMps: 1.0, compassDeg: 270 };
    expect(facingFrom(crawling)?.source).toBe('compass');
    expect(facingFrom({ ...crawling, moving: true })?.source).toBe('gps');
  });
});

describe('smoothDegrees', () => {
  it('takes the first reading as it is', () => {
    expect(smoothDegrees(undefined, 200)).toBe(200);
    expect(smoothDegrees(null, 370)).toBe(10);
  });

  it('moves only part of the way towards a new reading', () => {
    expect(smoothDegrees(100, 200, 0.1)).toBeCloseTo(110);
  });

  it('goes the short way round north', () => {
    expect(smoothDegrees(350, 10, 0.5)).toBeCloseTo(0);
    expect(smoothDegrees(10, 350, 0.5)).toBeCloseTo(0);
  });

  it('settles a shaking compass near where it is really pointing', () => {
    let smoothed = smoothDegrees(undefined, 90);
    for (let i = 0; i < 60; i += 1) smoothed = smoothDegrees(smoothed, i % 2 === 0 ? 70 : 110);
    expect(Math.abs(smoothed - 90)).toBeLessThan(5);
  });
});

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
