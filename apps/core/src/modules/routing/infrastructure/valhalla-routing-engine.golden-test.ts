import { describe, expect, it } from 'vitest';
import type { Dimensions } from '../domain/vehicle-profile.js';
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
 * Golden values recorded 2026-09-22 against the Northumberland extract dated 2026-09-21
 * (`northumberland-260921.osm.pbf`, per M2.1) with the dimensions below. If these start failing
 * after a deliberate extract refresh, re-verify by hand (same method as M2.1/M2.3/M2.5's manual
 * verifications) and update the golden values with a comment noting the new extract date.
 */
// Not read from the process environment (AGENTS.md rule 4 — that's read only in config.ts, and
// conventions.test.ts enforces it with no test-file exemption): golden tests always run against
// a fixed, CI-controlled local instance (infra/docker/compose.yml's published port), so there's
// no real need for a configurable override here.
const VALHALLA_URL = 'http://127.0.0.1:8002';

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
    expectWithinTolerance(result.value.distanceKm, 8.038, 0.1);
    expectWithinTolerance(result.value.durationMin, 7.924416666666667, 0.15);
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
    expectWithinTolerance(result.value.distanceKm, 15.947, 0.1);
    expectWithinTolerance(result.value.durationMin, 11.363216666666666, 0.15);
  });

  it('exclude_polygons still forces a real, measurable detour against live tiles', async () => {
    const request = {
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
      dimensions,
    };
    const withoutExclusion = await engine.route({ ...request, avoid: [] });
    const withExclusion = await engine.route({
      ...request,
      avoid: [
        {
          points: [
            { lat: 54.9788, lon: -2.0954 },
            { lat: 54.9828, lon: -2.0954 },
            { lat: 54.9828, lon: -2.0914 },
            { lat: 54.9788, lon: -2.0914 },
          ],
        },
      ],
    });
    expect(withoutExclusion.ok).toBe(true);
    expect(withExclusion.ok).toBe(true);
    if (!withoutExclusion.ok || !withExclusion.ok) return;
    expect(withExclusion.value.distanceKm).not.toBe(withoutExclusion.value.distanceKm);
  });
});
