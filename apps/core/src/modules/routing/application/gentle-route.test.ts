import { describe, expect, it } from 'vitest';

import { makeId } from '../../../shared/brand.js';
import type { ElevationPoint } from '../domain/hill-profile.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { findGentlestRoute } from './gentle-route.js';
import { previewRouteOptions } from './preview-route-options.js';
import type { RouteRequest, RouteResult } from './ports/routing-engine.js';
import { encodePolyline } from './testing/encode-polyline.js';
import { FakeRoutingEngine } from './testing/fake-routing-engine.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';

/** A straight road east from the start, 100 m between points, `lengthM` long. `lat` tells two routes apart. */
function line(lat: number, lengthM = 4500) {
  const points = [];
  for (let m = 0; m <= lengthM; m += 100) {
    points.push({ lat, lon: -1.5 + m / (111_320 * Math.cos((lat * Math.PI) / 180)) });
  }
  return points;
}

/** Heights every 100 m: flat, except `gradePct` between `fromM` and `toM`. */
function heights(gradePct: number, fromM: number, toM: number, lengthM = 4500): ElevationPoint[] {
  const out: ElevationPoint[] = [];
  let h = 100;
  for (let m = 0; m <= lengthM; m += 100) {
    if (m > fromM && m <= toM) h += gradePct;
    out.push({ distanceM: m, heightM: h });
  }
  return out;
}

const steepGeometry = encodePolyline(line(54.9));
const flatGeometry = encodePolyline(line(54.95));
const steep: RouteResult = {
  geometry: steepGeometry,
  distanceKm: 4.5,
  durationMin: 6,
  maneuvers: [],
};
const flat: RouteResult = { geometry: flatGeometry, distanceKm: 6, durationMin: 8, maneuvers: [] };

const request = (): RouteRequest => ({
  origin: { lat: 54.9, lon: -1.5 },
  destination: { lat: 54.9, lon: -1.45 },
  dimensions: { heightM: 4, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 },
  avoid: [],
});

function engineWithProfiles(): FakeRoutingEngine {
  const engine = new FakeRoutingEngine();
  engine.profiles.set(steepGeometry, heights(8, 1000, 3000));
  engine.profiles.set(flatGeometry, heights(0, 0, 0));
  return engine;
}

describe('findGentlestRoute', () => {
  it('is undefined when the engine has no heights, so nothing about the route changes', async () => {
    const engine = new FakeRoutingEngine();
    expect(await findGentlestRoute(engine, request(), [steep])).toBeUndefined();
  });

  it('leaves a route with no steep road alone and asks for no other', async () => {
    const engine = engineWithProfiles();
    const search = await findGentlestRoute(engine, request(), [flat]);
    expect(search?.gentlest.route).toBe(flat);
    expect(search?.gentlest.stats.steepKm).toBe(0);
    expect(engine.requests).toEqual([]);
  });

  it('puts avoid zones on a steep stretch and takes the gentler route the engine then finds', async () => {
    const engine = engineWithProfiles();
    engine.results = [{ ok: true, value: flat }];
    const search = await findGentlestRoute(engine, request(), [steep]);

    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0]!.avoid.length).toBeGreaterThan(0);
    expect(search?.candidates.map((c) => c.route)).toEqual([steep, flat]);
    expect(search?.gentlest.route).toBe(flat);
    // The zones that found it are kept, so a later pass for the same trip can keep off the same road.
    expect(search?.gentlest.hillZones.length).toBe(engine.requests[0]!.avoid.length);
  });

  it('keeps the steep route when no other route exists', async () => {
    const engine = engineWithProfiles();
    engine.results = [{ ok: false, error: { tag: 'NoRouteFound' } }];
    const search = await findGentlestRoute(engine, request(), [steep]);
    expect(search?.gentlest.route).toBe(steep);
    expect(search?.gentlest.stats.steepKm).toBeGreaterThan(1);
  });

  it('does not call a route gentle when it takes far longer than the quickest', async () => {
    const engine = engineWithProfiles();
    const detour = { ...flat, durationMin: 60 };
    engine.results = [{ ok: true, value: detour }];
    const search = await findGentlestRoute(engine, request(), [steep]);
    expect(search?.candidates).toHaveLength(2);
    expect(search?.gentlest.route).toBe(steep);
  });

  it('stops when the engine gives the same route again', async () => {
    const engine = engineWithProfiles();
    engine.results = [
      { ok: true, value: steep },
      { ok: true, value: steep },
    ];
    const search = await findGentlestRoute(engine, request(), [steep]);
    expect(engine.requests).toHaveLength(1);
    expect(search?.gentlest.route).toBe(steep);
  });
});

describe('previewRouteOptions for a loaded vehicle', () => {
  const driverId = makeId<'DriverId'>('driver-1');
  const profileId = makeId<'VehicleProfileId'>('profile-1');
  const dimensions: Dimensions = { heightM: 4, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 };

  async function setup() {
    const vehicleProfileRepo = new InMemoryVehicleProfileRepository();
    await vehicleProfileRepo.save({ id: profileId, driverId, name: 'Artic', dimensions });
    const routingEngine = engineWithProfiles();
    routingEngine.alternativesResult = { ok: true, value: [steep] };
    routingEngine.results = [{ ok: true, value: flat }];
    return {
      deps: { vehicleProfileRepo, routingEngine, fuelPricePerLitreGBP: 1.6 },
      routingEngine,
    };
  }
  const input = {
    driverId,
    profileId,
    origin: { lat: 54.9, lon: -1.5 },
    destination: { lat: 54.9, lon: -1.45 },
  };

  it('offers the quickest and the gentler route, each with its hills', async () => {
    const { deps } = await setup();
    const result = await previewRouteOptions(deps, { ...input, loaded: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [quickest, gentle] = result.value;
    // The steep road is also the shorter of the two, so it carries both labels.
    expect(quickest).toMatchObject({ geometry: steepGeometry, labels: ['fastest', 'shortest'] });
    expect(quickest!.hills!.steepKm).toBeGreaterThan(1);
    expect(gentle).toMatchObject({ geometry: flatGeometry, labels: ['gentle'] });
    expect(gentle!.hills).toMatchObject({ steepKm: 0, steepStretches: 0 });
  });

  it("leaves out routes the search tried that are neither the engine's own nor the gentlest", async () => {
    const { deps, routingEngine } = await setup();
    const middle = { ...flat, geometry: encodePolyline(line(54.97)), durationMin: 7 };
    routingEngine.profiles.set(middle.geometry, heights(7, 1000, 3000));
    // The first search round finds a route as steep as the quickest and still above the limit, the second the gentle one.
    routingEngine.results = [
      { ok: true, value: middle },
      { ok: true, value: flat },
    ];
    const result = await previewRouteOptions(deps, { ...input, loaded: true });
    if (!result.ok) throw new Error('expected options');
    expect(result.value.map((o) => o.geometry)).not.toContain(middle.geometry);
    expect(result.value.map((o) => o.geometry)).toContain(flatGeometry);
  });

  it('gives the one route both labels when it is the quickest and the gentlest', async () => {
    const { deps, routingEngine } = await setup();
    routingEngine.alternativesResult = { ok: true, value: [flat] };
    const result = await previewRouteOptions(deps, { ...input, loaded: true });
    if (!result.ok) throw new Error('expected options');
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.labels).toEqual(expect.arrayContaining(['fastest', 'gentle']));
  });

  it('checks no hills for an empty vehicle', async () => {
    const { deps, routingEngine } = await setup();
    const result = await previewRouteOptions(deps, input);
    if (!result.ok) throw new Error('expected options');
    expect(result.value.every((o) => o.hills === undefined)).toBe(true);
    expect(routingEngine.profileRequests).toEqual([]);
  });

  it('carries on without hills when the engine has no heights', async () => {
    const { deps, routingEngine } = await setup();
    routingEngine.profiles.clear();
    const result = await previewRouteOptions(deps, { ...input, loaded: true });
    if (!result.ok) throw new Error('expected options');
    expect(result.value.every((o) => o.hills === undefined)).toBe(true);
    expect(result.value.some((o) => o.labels.includes('gentle'))).toBe(false);
  });
});
