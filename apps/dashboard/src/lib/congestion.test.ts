import { describe, expect, it } from 'vitest';
import { mapLink, timeLeftText, waitText } from './congestion';

describe('congestion helpers', () => {
  it('writes a wait in minutes, or hours and minutes', () => {
    expect(waitText(20)).toBe('20 min');
    expect(waitText(60)).toBe('1 h');
    expect(waitText(95)).toBe('1 h 35 min');
  });

  it('says how long is left, or that it has expired', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const running = { active: true, expiresAt: '2026-10-20T12:15:00.000Z' };
    expect(timeLeftText(running, now)).toBe('15 min left');
    expect(timeLeftText({ active: false, expiresAt: '2026-10-20T11:00:00.000Z' }, now)).toBe(
      'Expired',
    );
  });

  it('links to the place on a map', () => {
    expect(mapLink({ location: { lat: 54.97, lon: -2.1 } })).toBe(
      'https://www.openstreetmap.org/?mlat=54.97&mlon=-2.1#map=15/54.97/-2.1',
    );
  });
});
