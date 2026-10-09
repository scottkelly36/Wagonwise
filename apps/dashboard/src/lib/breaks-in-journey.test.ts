import { describe, expect, it } from 'vitest';
import { breakEffectFor, breaksInJourney } from './breaks-in-journey';

const eu = {
  drivingLeftMin: 80,
  next: 'break',
  breakMin: 45,
  stretchMin: 270,
  untilLimitMin: 400,
} as const;

describe('breaksInJourney', () => {
  it('adds nothing for a journey inside the driving left', () => {
    expect(breaksInJourney(80, eu)).toEqual({ kind: 'none' });
    expect(breaksInJourney(30, eu)).toEqual({ kind: 'none' });
  });

  it('adds one break once the driving left runs out', () => {
    expect(breaksInJourney(81, eu)).toEqual({ kind: 'breaks', breaks: 1, extraMin: 45 });
    expect(breaksInJourney(350, eu)).toEqual({ kind: 'breaks', breaks: 1, extraMin: 45 });
  });

  it('adds another each time the allowed stretch is used up', () => {
    // 80 + 270 = 350 to the second break; 80 + 540 = 620 to the third, but the limit stops it first.
    expect(breaksInJourney(351, eu)).toEqual({ kind: 'breaks', breaks: 2, extraMin: 90 });
    expect(breaksInJourney(400, eu)).toEqual({ kind: 'breaks', breaks: 2, extraMin: 90 });
  });

  it('says a rest is needed when the journey is past the driving left before a rest', () => {
    expect(breaksInJourney(401, eu)).toEqual({ kind: 'rest' });
    expect(breaksInJourney(100, { drivingLeftMin: 60, next: 'limit' })).toEqual({ kind: 'rest' });
  });

  it('adds nothing when the phone sent no figures, or the rule set has no break', () => {
    expect(breaksInJourney(200, undefined)).toEqual({ kind: 'none' });
    expect(breaksInJourney(200, { drivingLeftMin: 80, next: 'break' })).toEqual({ kind: 'none' });
    expect(breaksInJourney(200, { ...eu, breakMin: 0 })).toEqual({ kind: 'none' });
  });
});

describe('breakEffectFor', () => {
  const now = new Date('2026-10-09T12:00:00.000Z');
  const status = (updatedAt: string) => ({
    driverId: 'd',
    state: 'driving' as const,
    ...eu,
    updatedAt,
  });

  it('uses a fresh status', () => {
    expect(breakEffectFor(200, status('2026-10-09T11:50:00.000Z'), now)).toEqual({
      kind: 'breaks',
      breaks: 1,
      extraMin: 45,
    });
  });

  it('ignores one that is old, or missing', () => {
    expect(breakEffectFor(200, status('2026-10-09T11:30:00.000Z'), now)).toEqual({ kind: 'none' });
    expect(breakEffectFor(200, undefined, now)).toEqual({ kind: 'none' });
  });
});
