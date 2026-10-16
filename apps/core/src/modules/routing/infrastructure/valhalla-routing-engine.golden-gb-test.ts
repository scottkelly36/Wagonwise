import { describe, expect, it } from 'vitest';
import type { Dimensions } from '../domain/vehicle-profile.js';
import type { RouteResult } from '../application/ports/routing-engine.js';
import { ValhallaRoutingEngine } from './valhalla-routing-engine.js';

/**
 * Golden routes for the whole of Great Britain: real requests against the live Valhalla that serves the national tiles, run by
 * hand with `pnpm test:golden:gb` (after a map rebuild, or any change to routing). Not in the nightly workflow: that builds a
 * small Northumberland copy on a CI machine, and the national graph needs about 16 GB to build and 8 GB to serve.
 *
 * The routing server has no public address, so reach it through a tunnel first (the port is fixed, as for the other golden
 * tests, because the environment is only read in config.ts):
 *   ssh -N -L 8003:<serving droplet private IP>:8002 root@<serving droplet public IP>
 * The addresses are in docs/deployment-guide.md section 10. `pnpm test:golden:gb` then talks to http://127.0.0.1:8003.
 *
 * Tolerances are loose on purpose (monthly rebuilds change roads a little). These catch a materially different route: broken
 * or missing tiles, an area that stopped routing, or a limit that came back (a long route failing outright). Re-record the
 * values after a deliberate change: every run prints `golden actual:` lines; check them by hand, then update them here with a
 * note of the date and why.
 *
 * Recorded 2026-10-16 against the first national build (the Geofabrik Great Britain extract of that day), after the trace
 * limits on the live server were raised (before that, Penzance to Wick, over 16,000 points, was timed by the rough fallback
 * and its average speed came out over the cap).
 */
const VALHALLA_URL = 'http://127.0.0.1:8003';

/** Mirrors `HGV_TOP_SPEED_KPH` in the Northumberland golden tests: an average faster than this means the speed cap is not applied. */
const HGV_TOP_SPEED_KPH = 88;

const dimensions: Dimensions = {
  heightM: 4.2,
  widthM: 2.6,
  lengthM: 16.5,
  grossWeightT: 32,
  axleWeightT: 10,
};

interface GoldenRoute {
  readonly name: string;
  readonly why: string;
  readonly origin: { readonly lat: number; readonly lon: number };
  readonly destination: { readonly lat: number; readonly lon: number };
  /** Recorded distance and time; absent until recorded. */
  readonly golden?: { readonly distanceKm: number; readonly durationMin: number };
}

const ROUTES: readonly GoldenRoute[] = [
  {
    name: 'penzance-wick',
    why: 'the longest journey in Great Britain: tens of thousands of points, the limits that were raised for it',
    origin: { lat: 50.1188, lon: -5.5371 },
    destination: { lat: 58.4416, lon: -3.0942 },
    golden: { distanceKm: 1307.203, durationMin: 914.2261 },
  },
  {
    name: 'london-edinburgh',
    why: 'the main north-south trunk route, through the M25 and the A1 or M1 and M6',
    origin: { lat: 51.5072, lon: -0.1276 },
    destination: { lat: 55.9533, lon: -3.1883 },
    golden: { distanceKm: 601.802, durationMin: 442.1374 },
  },
  {
    name: 'cardiff-inverness',
    why: 'Wales to the Highlands, across England and the Scottish borders',
    origin: { lat: 51.4816, lon: -3.1791 },
    destination: { lat: 57.4778, lon: -4.2247 },
    golden: { distanceKm: 885.863, durationMin: 622.6229 },
  },
  {
    name: 'dover-felixstowe',
    why: 'port to port around London, including the Dartford crossing',
    origin: { lat: 51.1279, lon: 1.3134 },
    destination: { lat: 51.959, lon: 1.351 },
    golden: { distanceKm: 220.795, durationMin: 155.6602 },
  },
  {
    name: 'glasgow-edinburgh',
    why: 'the central belt of Scotland',
    origin: { lat: 55.8642, lon: -4.2518 },
    destination: { lat: 55.9533, lon: -3.1883 },
    golden: { distanceKm: 83.629, durationMin: 65.7384 },
  },
  {
    name: 'manchester-leeds',
    why: 'across the Pennines',
    origin: { lat: 53.4808, lon: -2.2426 },
    destination: { lat: 53.8008, lon: -1.5491 },
    golden: { distanceKm: 69.917, durationMin: 54.2485 },
  },
  {
    name: 'carlisle-glasgow',
    why: 'across the border by the M74',
    origin: { lat: 54.8925, lon: -2.9329 },
    destination: { lat: 55.8642, lon: -4.2518 },
    golden: { distanceKm: 154.872, durationMin: 109.9645 },
  },
  {
    name: 'fort-william-ullapool',
    why: 'single-track and slow roads in the Highlands',
    origin: { lat: 56.8198, lon: -5.1052 },
    destination: { lat: 57.8955, lon: -5.1597 },
    golden: { distanceKm: 185.957, durationMin: 143.2132 },
  },
  {
    name: 'inverness-thurso',
    why: 'the A9 to the far north',
    origin: { lat: 57.4778, lon: -4.2247 },
    destination: { lat: 58.5954, lon: -3.5217 },
    golden: { distanceKm: 174.518, durationMin: 130.0811 },
  },
  {
    name: 'aberystwyth-shrewsbury',
    why: 'mid-Wales, mountain roads',
    origin: { lat: 52.4153, lon: -4.0829 },
    destination: { lat: 52.7073, lon: -2.7553 },
    golden: { distanceKm: 122.736, durationMin: 96.8927 },
  },
  {
    name: 'bristol-exeter',
    why: 'the South West by the M5',
    origin: { lat: 51.4545, lon: -2.5879 },
    destination: { lat: 50.7184, lon: -3.5339 },
    golden: { distanceKm: 129.67, durationMin: 98.1028 },
  },
  {
    name: 'central-london-heathrow',
    why: 'a short, dense urban route',
    origin: { lat: 51.5074, lon: -0.1278 },
    destination: { lat: 51.47, lon: -0.4543 },
    golden: { distanceKm: 27.71, durationMin: 31.2646 },
  },
];

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

describe('golden routes (live Valhalla, Great Britain tiles)', () => {
  const engine = new ValhallaRoutingEngine(VALHALLA_URL);

  for (const route of ROUTES) {
    it(`${route.name}: ${route.why}`, async () => {
      const result = await engine.route({
        origin: route.origin,
        destination: route.destination,
        dimensions,
        avoid: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      report(route.name, result.value);
      if (route.golden !== undefined) {
        expectWithinTolerance(result.value.distanceKm, route.golden.distanceKm, 0.1);
        expectWithinTolerance(result.value.durationMin, route.golden.durationMin, 0.15);
      }
      // A truck's average speed can never beat its own top speed: if it does, the cap is not being applied.
      expect(result.value.distanceKm / (result.value.durationMin / 60)).toBeLessThanOrEqual(
        HGV_TOP_SPEED_KPH,
      );
      expect(result.value.geometry.length).toBeGreaterThan(100);
    }, 120_000);
  }

  // Northern Ireland is left out of the tiles on purpose (docs/deployment-guide.md section 10). If it is ever added, this is
  // the test to change.
  it('does not route in Northern Ireland, which is not covered', async () => {
    const result = await engine.route({
      origin: { lat: 54.5973, lon: -5.9301 },
      destination: { lat: 54.9966, lon: -7.3086 },
      dimensions,
      avoid: [],
    });
    expect(result.ok).toBe(false);
  });
});
