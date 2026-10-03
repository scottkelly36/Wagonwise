import { describe, expect, it } from 'vitest';

import {
  etaText,
  formatDuration,
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

describe('formatDuration', () => {
  it.each([
    [0.2, '1 min'],
    [50, '50 min'],
    [59.6, '1 h'],
    [60, '1 h'],
    [80, '1 h 20 min'],
    [125, '2 h 5 min'],
  ])('%d minutes reads %s', (minutes, label) => {
    expect(formatDuration(minutes)).toBe(label);
  });
});

describe('etaText', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');
  const eta = { durationMin: 50, fromRecordedAt: '2026-10-03T11:59:00.000Z' };

  it('gives the journey and an arrival time from the last position', () => {
    const text = etaText(eta, 'live', now);
    expect(text.startsWith('50 min journey · around ')).toBe(true);
    // 11:59Z + 50 min = 12:49Z, which is 13:49 in London (BST) — formatted in the viewer's zone.
    expect(text).toMatch(/around \d{2}:\d{2}$/);
  });

  it('still gives a clock time for a stale position', () => {
    expect(etaText(eta, 'stale', now)).toMatch(/around \d{2}:\d{2}$/);
  });

  it('claims no clock time once the position is lost', () => {
    expect(etaText(eta, 'lost', now)).toBe('50 min from where they were last seen');
  });

  it('says due about now when the arrival has passed', () => {
    const old = { durationMin: 10, fromRecordedAt: '2026-10-03T11:30:00.000Z' };
    expect(etaText(old, 'stale', now)).toBe('10 min journey · due about now');
  });
});
