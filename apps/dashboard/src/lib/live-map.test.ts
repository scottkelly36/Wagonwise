import { describe, expect, it } from 'vitest';

import {
  formatMiles,
  isOnTheRoad,
  lastSeen,
  mapStyleUrl,
  nextStop,
  straightLineMetres,
} from './live-map';

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

describe('straightLineMetres', () => {
  it('is zero for the same point', () => {
    expect(straightLineMetres({ lat: 54.97, lon: -2.1 }, { lat: 54.97, lon: -2.1 })).toBe(0);
  });

  it('matches a known distance: Hexham to Newcastle is about 33 km as the crow flies', () => {
    const hexham = { lat: 54.9735, lon: -2.1019 };
    const newcastle = { lat: 54.9783, lon: -1.6178 };
    const km = straightLineMetres(hexham, newcastle) / 1000;
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(33);
  });

  it('is symmetric', () => {
    const a = { lat: 51.5, lon: -0.12 };
    const b = { lat: 53.48, lon: -2.24 };
    expect(straightLineMetres(a, b)).toBeCloseTo(straightLineMetres(b, a), 6);
  });
});

describe('formatMiles', () => {
  it.each([
    [50, 'under 0.1 mi'],
    [1609.344, '1.0 mi'],
    [8000, '5.0 mi'],
    [16093, '10 mi'],
    [100_000, '62 mi'],
  ])('%d m reads %s', (metres, label) => {
    expect(formatMiles(metres)).toBe(label);
  });
});
