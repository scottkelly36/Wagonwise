import { describe, expect, it } from 'vitest';
import { avoidZonesFor } from '../domain/closure-avoid-zones.js';
import {
  indexRoute,
  placeClosuresOnRoute,
  type ClosureCandidate,
} from '../domain/closure-on-route.js';
import { decodePolyline, type GeoPoint } from '../domain/geo.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { ValhallaRoutingEngine } from './valhalla-routing-engine.js';

/**
 * Whether the thin avoid zones that stage 3 of the National Highways work lays along a closure shut _that carriageway only_. This is
 * the one thing the unit tests cannot show: they stop at the polygons, and what Valhalla does with a polygon is its own business.
 * Real Valhalla, Northumberland extract, like the other golden tests (`pnpm test:golden`; not part of `pnpm test`).
 *
 * The closure is made up, but from the route itself: a stretch of the A1 north of Newcastle where the route north and the route south
 * run on two carriageways a lane's width or two apart. The test looks for such a stretch in the data rather than naming coordinates,
 * so a data change cannot quietly move the road out from under it; if there is no dual carriageway on the way, it fails and says so.
 */
const VALHALLA_URL = 'http://127.0.0.1:8002';
const NEWCASTLE = { lat: 55.0, lon: -1.62 };
const ALNWICK = { lat: 55.41, lon: -1.71 };

const dimensions: Dimensions = {
  heightM: 4.2,
  widthM: 2.6,
  lengthM: 16.5,
  grossWeightT: 32,
  axleWeightT: 10,
};

const METRES_PER_DEGREE_LAT = 111_320;

/** How far a point is from a line of points, in metres. */
function distanceToLine(point: GeoPoint, line: readonly GeoPoint[]): number {
  const perDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((point.lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1]!.lon - point.lon) * perDegreeLon;
    const ay = (line[i - 1]!.lat - point.lat) * METRES_PER_DEGREE_LAT;
    const bx = (line[i]!.lon - point.lon) * perDegreeLon;
    const by = (line[i]!.lat - point.lat) * METRES_PER_DEGREE_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

describe('closure avoid zones (real Valhalla, Northumberland extract)', () => {
  const engine = new ValhallaRoutingEngine(VALHALLA_URL);

  it('sends the route that uses the shut carriageway round, and leaves the other carriageway open', async () => {
    const north = await engine.route({
      origin: NEWCASTLE,
      destination: ALNWICK,
      dimensions,
      avoid: [],
    });
    const south = await engine.route({
      origin: ALNWICK,
      destination: NEWCASTLE,
      dimensions,
      avoid: [],
    });
    expect(north.ok && south.ok).toBe(true);
    if (!north.ok || !south.ok) return;
    const northLine = decodePolyline(north.value.geometry);
    const southLine = decodePolyline(south.value.geometry);

    // A stretch of 1.5 km of the way north, every point of which has the way south running 5 to 40 m off: a dual carriageway.
    const route = indexRoute(northLine);
    const onDual = northLine.map((p) => {
      const d = distanceToLine(p, southLine);
      return d >= 5 && d <= 40;
    });
    let from = -1;
    let to = -1;
    for (let i = 0; i < northLine.length && to < 0; i++) {
      if (!onDual[i]) {
        from = -1;
        continue;
      }
      if (from < 0) from = i;
      if (route.offsets[i]! - route.offsets[from]! >= 1500) to = i;
    }
    expect(
      to,
      'no dual carriageway found on the way north: the test data has changed',
    ).toBeGreaterThan(0);

    // The closure as National Highways would draw it: a line in the direction of travel along that carriageway.
    const closure: ClosureCandidate = {
      id: 'made-up',
      kind: 'full',
      description: 'A1 northbound carriageway closure (made up for the test)',
      startsAt: new Date('2026-11-02T20:00:00.000Z'),
      endsAt: new Date('2026-11-03T06:00:00.000Z'),
      position: northLine[from]!,
      lines: [northLine.slice(from, to + 1)],
    };
    const [placed] = placeClosuresOnRoute(route, [closure]);
    expect(placed).toBeDefined();
    const zones = avoidZonesFor(route, [placed!]);
    expect(zones.length).toBeGreaterThan(5);

    const northAround = await engine.route({
      origin: NEWCASTLE,
      destination: ALNWICK,
      dimensions,
      avoid: zones,
    });
    const southAround = await engine.route({
      origin: ALNWICK,
      destination: NEWCASTLE,
      dimensions,
      avoid: zones,
    });
    expect(northAround.ok && southAround.ok).toBe(true);
    if (!northAround.ok || !southAround.ok) return;

    // The way north has to go round: it no longer follows the shut stretch...
    const stretch = northLine.slice(from, to + 1);
    const stillOnIt = decodePolyline(northAround.value.geometry).filter(
      (p) => distanceToLine(p, stretch) < 3,
    );
    expect(stillOnIt.length).toBe(0);
    expect(northAround.value.geometry).not.toBe(north.value.geometry);

    // ...and the way south, on the carriageway next to it, is exactly as it was.
    expect(southAround.value.geometry).toBe(south.value.geometry);
    expect(southAround.value.distanceKm).toBe(south.value.distanceKm);
  });

  it('shuts a slip road without shutting the main carriageway it leaves from', async () => {
    const request = { dimensions, avoid: [] };
    const toMorpeth = await engine.route({
      ...request,
      origin: ALNWICK,
      destination: { lat: 55.1667, lon: -1.6833 },
    });
    // Passes the Morpeth junction on the A1 and carries on to leave it further south.
    const pastMorpeth = await engine.route({
      ...request,
      origin: ALNWICK,
      destination: { lat: 55.0869, lon: -1.5845 },
    });
    expect(toMorpeth.ok && pastMorpeth.ok).toBe(true);
    if (!toMorpeth.ok || !pastMorpeth.ok) return;

    // The slip road is the exit manoeuvre of the way to Morpeth, up to the next manoeuvre.
    const line = decodePolyline(toMorpeth.value.geometry);
    const { maneuvers } = toMorpeth.value;
    const exit = maneuvers.findIndex((m) => m.kind === 'exit_left' || m.kind === 'exit_right');
    expect(
      exit,
      'no exit from the A1 on the way to Morpeth: the test data has changed',
    ).toBeGreaterThan(0);
    const slip = line.slice(
      maneuvers[exit]!.beginShapeIndex,
      maneuvers[exit + 1]!.beginShapeIndex + 1,
    );
    expect(slip.length).toBeGreaterThan(2);

    const closure: ClosureCandidate = {
      id: 'made-up-slip',
      kind: 'full',
      description: 'A1 northbound exit slip road closure (made up for the test)',
      startsAt: new Date('2026-11-02T20:00:00.000Z'),
      endsAt: new Date('2026-11-03T06:00:00.000Z'),
      position: slip[0]!,
      lines: [slip],
    };
    const route = indexRoute(line);
    const [placed] = placeClosuresOnRoute(route, [closure]);
    expect(placed).toBeDefined();
    const zones = avoidZonesFor(route, [placed!]);
    expect(zones.length).toBeGreaterThanOrEqual(1);

    const morpethAround = await engine.route({
      ...request,
      origin: ALNWICK,
      destination: { lat: 55.1667, lon: -1.6833 },
      avoid: zones,
    });
    const pastAround = await engine.route({
      ...request,
      origin: ALNWICK,
      destination: { lat: 55.0869, lon: -1.5845 },
      avoid: zones,
    });
    expect(morpethAround.ok && pastAround.ok).toBe(true);
    if (!morpethAround.ok || !pastAround.ok) return;

    // The way to Morpeth no longer takes that slip road (its middle: the ends are where it meets the main road)...
    const middle = slip.slice(1, -1);
    const onSlip = decodePolyline(morpethAround.value.geometry).filter(
      (p) => distanceToLine(p, middle) < 3,
    );
    expect(onSlip.length).toBe(0);
    // ...and the way past it stays on the main carriageway the slip road leaves, just as before.
    expect(pastAround.value.geometry).toBe(pastMorpeth.value.geometry);
  });
});
