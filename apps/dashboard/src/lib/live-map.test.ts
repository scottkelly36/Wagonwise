import { describe, expect, it } from 'vitest';

import { isOnTheRoad, lastSeen, mapStyleUrl, nextStop } from './live-map';

const pickup = { kind: 'pickup' as const, name: 'Depot', location: { lat: 54.9, lon: -2.1 } };
const delivery = { kind: 'delivery' as const, name: 'Port', location: { lat: 55, lon: -1.6 } };

describe('isOnTheRoad', () => {
  it('is true from accepted to at_delivery and false either side', () => {
    for (const s of ['accepted', 'at_pickup', 'loaded', 'en_route', 'at_delivery'] as const) {
      expect(isOnTheRoad(s)).toBe(true);
    }
    for (const s of ['draft', 'assigned', 'delivered', 'cancelled', 'failed'] as const) {
      expect(isOnTheRoad(s)).toBe(false);
    }
  });
});

describe('nextStop', () => {
  const stops = [pickup, delivery];
  it('is the pickup until the load is on, then the delivery', () => {
    expect(nextStop({ status: 'accepted', stops })).toBe(pickup);
    expect(nextStop({ status: 'at_pickup', stops })).toBe(pickup);
    expect(nextStop({ status: 'loaded', stops })).toBe(delivery);
    expect(nextStop({ status: 'en_route', stops })).toBe(delivery);
    expect(nextStop({ status: 'at_delivery', stops })).toBe(delivery);
  });

  it('is undefined when the job has no such stop', () => {
    expect(nextStop({ status: 'en_route', stops: [pickup] })).toBeUndefined();
  });
});

describe('lastSeen', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    [10_000, 'just now', 'live'],
    [90_000, '1 min ago', 'live'],
    [3 * 60_000, '3 min ago', 'stale'],
    [9 * 60_000, '9 min ago', 'stale'],
    [11 * 60_000, '11 min ago', 'lost'],
    [3 * 3_600_000, '3 h ago', 'lost'],
    [30 * 3_600_000, 'over a day ago', 'lost'],
  ])('%d ms ago reads %s (%s)', (ms, label, freshness) => {
    expect(lastSeen(ago(ms), now)).toEqual({ label, freshness });
  });

  it('treats a time slightly in the future (clock skew) as just now', () => {
    expect(lastSeen(ago(-5_000), now)).toEqual({ label: 'just now', freshness: 'live' });
  });
});

describe('mapStyleUrl', () => {
  it('uses MapTiler with a key and the keyless demo style without', () => {
    expect(mapStyleUrl('abc')).toBe('https://api.maptiler.com/maps/streets-v2/style.json?key=abc');
    expect(mapStyleUrl(undefined)).toBe('https://demotiles.maplibre.org/style.json');
    expect(mapStyleUrl('')).toBe('https://demotiles.maplibre.org/style.json');
  });
});
