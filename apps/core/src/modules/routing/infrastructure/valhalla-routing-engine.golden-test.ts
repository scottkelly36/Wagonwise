import { describe, expect, it } from 'vitest';
import { AVOID_ZONE_HALF_WIDTH_M, bufferPoint, decodePolyline } from '../domain/geo.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import type { RouteResult } from '../application/ports/routing-engine.js';
import { ValhallaRoutingEngine } from './valhalla-routing-engine.js';

/**
 * Golden-route tests: real requests against a real, tile-built Valhalla instance loaded with the
 * Northumberland extract (see README's Routing section for bringing it up). Not part of `pnpm
 * test`/`pnpm verify` — run with `pnpm test:golden` (decision 13: nightly and on map rebuild,
 * never per-PR, since building tiles takes minutes real hardware doesn't have to spend on every
 * push).
 *
 * Tolerances are deliberately loose, not exact equality: a weekly tile rebuild (design doc §4)
 * can shift a route slightly from minor, irrelevant OSM edits elsewhere on the way. What these
 * catch is a *materially* different route — broken tile data, or a real restriction that changed
 * which way is genuinely fastest — not routine data churn.
 *
 * Golden values re-recorded 2026-09-28 against Geofabrik's `northumberland-latest.osm.pbf` of
 * that date, after the 55mph truck `top_speed` cap (PR #38) made the original 2026-09-22 values
 * stale: slower trunk-road timing changes which way is fastest, not just how long it takes. If
 * these start failing after a deliberate routing change or extract refresh, every run prints the
 * actual values (`golden actual:` lines in the log) — re-verify by hand and update them here with
 * a comment noting the new date and reason.
 */
// Not read from the process environment (AGENTS.md rule 4 — that's read only in config.ts, and
// conventions.test.ts enforces it with no test-file exemption): golden tests always run against
// a fixed, CI-controlled local instance (infra/docker/compose.yml's published port), so there's
// no real need for a configurable override here.
const VALHALLA_URL = 'http://127.0.0.1:8002';

/** Mirrors `TOP_SPEED_KPH` in valhalla-routing-engine.ts — duplicated on purpose, so a change
 *  that silently drops or raises the cap fails here instead of passing its own unit test. */
const HGV_TOP_SPEED_KPH = 88;

const dimensions: Dimensions = {
  heightM: 4.2,
  widthM: 2.6,
  lengthM: 16.5,
  grossWeightT: 32,
  axleWeightT: 10,
};

function expectWithinTolerance(actual: number, golden: number, toleranceFraction: number): void {
  const tolerance = golden * toleranceFraction;
  expect(actual).toBeGreaterThanOrEqual(golden - tolerance);
  expect(actual).toBeLessThanOrEqual(golden + tolerance);
}

function report(name: string, route: RouteResult): void {
  console.info(
    `golden actual: ${name} distanceKm=${route.distanceKm} durationMin=${route.durationMin}`,
  );
}

/** A truck's average speed can never beat its own top speed — if it does, the cap isn't being
 *  sent to (or honoured by) Valhalla. */
function expectWithinSpeedCap(route: RouteResult): void {
  const averageKph = route.distanceKm / (route.durationMin / 60);
  expect(averageKph).toBeLessThanOrEqual(HGV_TOP_SPEED_KPH);
}

describe('golden routes (real Valhalla, Northumberland extract)', () => {
  const engine = new ValhallaRoutingEngine(VALHALLA_URL);

  it('Hexham town centre → Corbridge: a short route through town then the A69', async () => {
    const result = await engine.route({
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
      dimensions,
      avoid: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    report('hexham-corbridge', result.value);
    expectWithinTolerance(result.value.distanceKm, 7.637, 0.1);
    expectWithinTolerance(result.value.durationMin, 10.7669, 0.15);
    expectWithinSpeedCap(result.value);
    expect(result.value.geometry.length).toBeGreaterThan(100);
  });

  it('Hexham → toward Newcastle on the A69: a longer trunk-road route', async () => {
    const result = await engine.route({
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -1.9 },
      dimensions,
      avoid: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    report('hexham-newcastle', result.value);
    expectWithinTolerance(result.value.distanceKm, 18.438, 0.1);
    expectWithinTolerance(result.value.durationMin, 11.363216666666666, 0.15);
    expectWithinSpeedCap(result.value);
  });

  // The avoid zone is placed on whatever route Valhalla actually returns, not at fixed
  // coordinates: a fixed box silently stops testing anything once a routing or data change moves
  // the route off it (exactly what happened after the 55mph cap). Same mechanism and size a
  // reported hazard gets in production (`bufferPoint` + `AVOID_ZONE_HALF_WIDTH_M`).
  it('exclude_polygons still forces a real, measurable detour against live tiles', async () => {
    const request = {
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
      dimensions,
    };
    const withoutExclusion = await engine.route({ ...request, avoid: [] });
    expect(withoutExclusion.ok).toBe(true);
    if (!withoutExclusion.ok) return;

    const routePoints = decodePolyline(withoutExclusion.value.geometry);
    const midpoint = routePoints[Math.floor(routePoints.length / 2)];
    expect(midpoint).toBeDefined();
    if (!midpoint) return;
    const zone = bufferPoint(midpoint, AVOID_ZONE_HALF_WIDTH_M);

    const withExclusion = await engine.route({ ...request, avoid: [zone] });
    expect(withExclusion.ok).toBe(true);
    if (!withExclusion.ok) return;
    report('hexham-corbridge-excluded', withExclusion.value);
    expect(withExclusion.value.distanceKm).not.toBe(withoutExclusion.value.distanceKm);

    const lats = zone.points.map((p) => p.lat);
    const lons = zone.points.map((p) => p.lon);
    const insideZone = decodePolyline(withExclusion.value.geometry).filter(
      (p) =>
        p.lat >= Math.min(...lats) &&
        p.lat <= Math.max(...lats) &&
        p.lon >= Math.min(...lons) &&
        p.lon <= Math.max(...lons),
    );
    expect(insideZone).toEqual([]);
  });
});
