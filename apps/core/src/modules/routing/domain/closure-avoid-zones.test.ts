import { describe, expect, it } from 'vitest';
import {
  avoidZonesFor,
  MAX_CLOSURE_ZONES,
  ZONE_HALF_LENGTH_M,
  ZONE_END_INSET_M,
  ZONE_HALF_WIDTH_M,
  ZONE_SPACING_M,
} from './closure-avoid-zones.js';
import { indexRoute, placeClosuresOnRoute, type PlacedClosure } from './closure-on-route.js';
import type { GeoPoint, GeoPolygon } from './geo.js';

const LON = -2.3;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((53.35 * Math.PI) / 180);

function northSouth(from: number, to: number): GeoPoint[] {
  const n = Math.round(Math.abs(to - from) / 0.001);
  return Array.from({ length: n + 1 }, (_, i) => ({
    lat: +(from + 0.001 * i).toFixed(6),
    lon: LON,
  }));
}

const route = indexRoute(northSouth(53.3, 53.4));

function placedAlong(from: number, to: number, id = 'c1'): PlacedClosure {
  return placedOnLine(northSouth(from, to), id);
}

function placedOnLine(line: GeoPoint[], id = 'c1'): PlacedClosure {
  const [placed] = placeClosuresOnRoute(route, [
    {
      id,
      kind: 'full',
      description: 'closed',
      startsAt: new Date('2026-11-02T20:00:00.000Z'),
      endsAt: new Date('2026-11-03T06:00:00.000Z'),
      position: line[0]!,
      lines: [line],
    },
  ]);
  return placed!;
}

/** The corners as metres east and north of the route's own line (lon = LON), for judging how thin and where. */
const metres = (zone: GeoPolygon) =>
  zone.points.map((p) => ({
    x: (p.lon - LON) * M_PER_DEG_LON,
    y: (p.lat - 53.3) * M_PER_DEG_LAT,
  }));

describe('avoidZonesFor', () => {
  it('lays thin zones on the route itself, long in the direction it is going', () => {
    const zones = avoidZonesFor(route, [placedAlong(53.34, 53.35)]);
    expect(zones.length).toBeGreaterThan(3);
    for (const zone of zones) {
      const corners = metres(zone);
      expect(zone.points).toHaveLength(4);
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * ZONE_HALF_WIDTH_M, 0);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2 * ZONE_HALF_LENGTH_M, 0);
      // centred on the route's line, so on the carriageway it uses and no further than a lane's width from the middle of it
      expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0, 0);
    }
  });

  it('keeps clear of both ends of the closure, where it meets other roads', () => {
    const placed = placedAlong(53.34, 53.35);
    const zones = avoidZonesFor(route, [placed]);
    for (const zone of zones) {
      const centreY = metres(zone).reduce((sum, c) => sum + c.y, 0) / 4;
      expect(centreY).toBeGreaterThanOrEqual(placed.fromM + ZONE_END_INSET_M - 1);
      expect(centreY).toBeLessThanOrEqual(placed.toM - ZONE_END_INSET_M + 1);
    }
  });

  it('keeps the zones inside the closure, which runs 4 to 5 km along the route', () => {
    const zones = avoidZonesFor(route, [placedAlong(53.34, 53.35)]);
    for (const zone of zones) {
      const centreY = metres(zone).reduce((sum, c) => sum + c.y, 0) / 4;
      expect(centreY).toBeGreaterThan(0.04 * M_PER_DEG_LAT - 60);
      expect(centreY).toBeLessThan(0.05 * M_PER_DEG_LAT + 60);
    }
  });

  it('spaces them out, so a long closure is not a wall of them', () => {
    const zones = avoidZonesFor(route, [placedAlong(53.34, 53.35)]);
    const centres = zones.map((z) => metres(z).reduce((sum, c) => sum + c.y, 0) / 4);
    for (let i = 1; i < centres.length; i++) {
      expect(centres[i]! - centres[i - 1]!).toBeGreaterThanOrEqual(ZONE_SPACING_M - 1);
    }
    // 1.1 km of closure
    expect(zones.length).toBeLessThanOrEqual(Math.ceil(1100 / ZONE_SPACING_M) + 1);
  });

  it('puts a zone in the middle of a closure too short to have any room at its ends', () => {
    const zones = avoidZonesFor(route, [
      placedOnLine([
        { lat: 53.34, lon: LON },
        { lat: 53.3406, lon: LON },
      ]),
    ]);
    expect(zones.length).toBeGreaterThanOrEqual(1);
  });

  it('thins the zones of one very long closure rather than using them all', () => {
    const zones = avoidZonesFor(route, [placedAlong(53.31, 53.39)]);
    expect(zones.length).toBeLessThanOrEqual(40);
    expect(zones.length).toBeGreaterThan(10);
  });

  it('stops at the number it is given, nearest the start first', () => {
    const first = placedAlong(53.31, 53.32, 'first');
    const second = placedAlong(53.36, 53.37, 'second');
    const all = avoidZonesFor(route, [first, second]);
    const capped = avoidZonesFor(route, [first, second], 5);
    expect(capped).toHaveLength(5);
    expect(capped).toEqual(all.slice(0, 5));
  });

  it('gives none when there is no room', () => {
    expect(avoidZonesFor(route, [placedAlong(53.34, 53.35)], 0)).toEqual([]);
  });

  it("holds all closures to the cap that keeps clear of Valhalla's limit on avoid areas", () => {
    const many = [0.31, 0.33, 0.35, 0.37, 0.39].map((from, i) =>
      placedAlong(53 + from, 53 + from + 0.015, `c${i}`),
    );
    expect(avoidZonesFor(route, many).length).toBeLessThanOrEqual(MAX_CLOSURE_ZONES);
  });
});
