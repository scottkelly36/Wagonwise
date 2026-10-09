import type { HoursStatusDto } from '@wagonwise/contracts/hours';
import { describe, expect, it } from 'vitest';
import { hoursStatusText, hoursStatusUrgent, minutesText } from './hours-status';

const status = (over: Partial<HoursStatusDto> = {}): HoursStatusDto => ({
  driverId: 'd',
  state: 'driving',
  drivingLeftMin: 80,
  next: 'break',
  updatedAt: '2026-10-09T09:00:00.000Z',
  ...over,
});

describe('hoursStatusText', () => {
  it('says what the driver is doing and about how long is left, and until what', () => {
    expect(hoursStatusText(status(), 2)).toBe(
      'Driving, about 1h 20m of driving left before a break',
    );
    expect(hoursStatusText(status({ next: 'limit', drivingLeftMin: 45 }), 2)).toBe(
      'Driving, about 45m of driving left before their limit',
    );
  });

  it('marks a status that has not been updated for a while', () => {
    expect(hoursStatusText(status({ state: 'working' }), 25)).toMatch(/updated 25 min ago\)$/);
  });

  it('reads an on-break driver without calling it driving', () => {
    expect(hoursStatusText(status({ state: 'on_break' }), 1)).toMatch(/^On a break; about/);
  });
});

describe('minutesText and hoursStatusUrgent', () => {
  it('formats minutes', () => {
    expect(minutesText(0)).toBe('0m');
    expect(minutesText(125)).toBe('2h 05m');
  });

  it('is urgent under half an hour of driving, but not for someone on a break', () => {
    expect(hoursStatusUrgent(status({ drivingLeftMin: 20 }))).toBe(true);
    expect(hoursStatusUrgent(status({ drivingLeftMin: 20, state: 'on_break' }))).toBe(false);
    expect(hoursStatusUrgent(status({ drivingLeftMin: 90 }))).toBe(false);
  });
});
