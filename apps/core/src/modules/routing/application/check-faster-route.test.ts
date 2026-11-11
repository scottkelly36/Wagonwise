import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { ok } from '../../../shared/result.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { FakeFasterRouteOfferLog } from './testing/fake-faster-route-offer-log.js';
import type { GeoPoint } from '../domain/geo.js';
import type { RoutePlan } from '../domain/route-plan.js';
import {
  checkFasterRoute,
  type CheckFasterRouteDeps,
  type CheckFasterRouteInput,
} from './check-faster-route.js';
import { FakeCongestionQuery } from './testing/fake-congestion-query.js';
import { FakeClosureAvoidanceQuery } from './testing/fake-closure-avoidance-query.js';
import { FakeHazardAvoidanceQuery } from './testing/fake-hazard-avoidance-query.js';
import { FakeHazardsOnRouteQuery } from './testing/fake-hazards-on-route-query.js';
import { FakeRestrictionOverrideRepository } from './testing/fake-restriction-override-repository.js';
import { FakeRoutingEngine } from './testing/fake-routing-engine.js';
import { FakeTrafficQuery } from './testing/fake-traffic-query.js';
import { encodePolyline } from './testing/encode-polyline.js';
import { InMemoryActiveTripRepository } from './testing/in-memory-active-trip-repository.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';

const driverId = makeId<'DriverId'>('driver-1');
const profileId = makeId<'VehicleProfileId'>('profile-1');
const tripId = makeId<'ActiveTripId'>('trip-1');
const now = new Date('2026-10-10T09:00:00.000Z');
const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

/** A line due north, one point every 0.01 degrees of latitude (about 1.1 km), 40 points (about 43 km). */
function northLine(lon: number): GeoPoint[] {
  return Array.from({ length: 40 }, (_, i) => ({ lat: 55 + i * 0.01, lon }));
}
const currentPoints = northLine(-2.0);
const altPoints = northLine(-1.95);
const start = currentPoints[0] as GeoPoint;
const end = currentPoints[currentPoints.length - 1] as GeoPoint;

const plan: RoutePlan = {
  id: makeId<'RoutePlanId'>('plan-1'),
  driverId,
  profileId,
  origin: start,
  destination: end,
  geometry: encodePolyline(currentPoints),
  distanceKm: 43,
  durationMin: 45,
  avoidedRestrictions: [],
  maneuvers: [],
  hazardsOnRoute: [],
  createdAt: now,
};
const altRoute = {
  geometry: encodePolyline(altPoints),
  distanceKm: 45,
  durationMin: 50,
  maneuvers: [],
};

/** A report on the current route (lon -2.0) only. */
function waitOnCurrentRoute(minutes: number): FakeCongestionQuery {
  const congestion = new FakeCongestionQuery();
  congestion.waitsFor = (line) =>
    line.some((p) => p.lon === -2.0)
      ? [{ id: 'c1', location: { lat: 55.2, lon: -2.0 }, waitMinutes: minutes }]
      : [];
  return congestion;
}

async function build(options: { congestion?: FakeCongestionQuery; ended?: boolean } = {}): Promise<{
  deps: CheckFasterRouteDeps;
  routePlanRepo: InMemoryRoutePlanRepository;
  engine: FakeRoutingEngine;
  hazards: FakeHazardAvoidanceQuery;
  traffic: FakeTrafficQuery;
  clock: FakeClock;
  input: CheckFasterRouteInput;
}> {
  const routePlanRepo = new InMemoryRoutePlanRepository();
  const activeTripRepo = new InMemoryActiveTripRepository(routePlanRepo);
  const vehicleProfileRepo = new InMemoryVehicleProfileRepository();
  const engine = new FakeRoutingEngine();
  engine.alternativesResult = ok([altRoute]);
  engine.result = ok(altRoute);
  const hazards = new FakeHazardAvoidanceQuery();
  const traffic = new FakeTrafficQuery();
  const clock = new FakeClock(now);
  await vehicleProfileRepo.save({ id: profileId, driverId, name: 'Wagon', dimensions });
  await routePlanRepo.save(plan);
  await activeTripRepo.save({
    id: tripId,
    routePlanId: plan.id,
    driverId,
    startedAt: now,
    ...(options.ended === true ? { endedAt: now } : {}),
  });
  const deps: CheckFasterRouteDeps = {
    activeTripRepo,
    routePlanRepo,
    vehicleProfileRepo,
    routingEngine: engine,
    hazardAvoidanceQuery: hazards,
    hazardsOnRouteQuery: new FakeHazardsOnRouteQuery(),
    closureAvoidanceQuery: new FakeClosureAvoidanceQuery(),
    restrictionOverrideRepo: new FakeRestrictionOverrideRepository(),
    congestionQuery: options.congestion ?? new FakeCongestionQuery(),
    trafficQuery: traffic,
    offerLog: new FakeFasterRouteOfferLog(),
    clock,
    ids: new SequentialIdGenerator(),
    fuelPricePerLitreGBP: 1.6,
  };
  return {
    deps,
    routePlanRepo,
    engine,
    hazards,
    traffic,
    clock,
    input: { driverId, tripId, position: start, keptKeys: [] },
  };
}

async function offerOf(deps: CheckFasterRouteDeps, input: CheckFasterRouteInput) {
  const result = await checkFasterRoute(deps, input);
  if (!result.ok) throw new Error(result.error.tag);
  return result.value;
}

describe('checkFasterRoute', () => {
  it('offers a quicker route when drivers report a long wait ahead, and saves it as a plan', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    const offer = await offerOf(b.deps, b.input);
    // Current: 45 + 20 = 65 minutes. Alternative: 50. Saves 15, over the larger of 5 and 6.5.
    expect(offer).toMatchObject({ savingMinutes: 15, currentMinutes: 65, alternativeMinutes: 50 });
    const saved = await b.routePlanRepo.findById(offer?.routePlanId as RoutePlan['id']);
    expect(saved?.origin).toEqual(start);
    expect(saved?.destination).toEqual(end);
    expect(saved?.geometry).toBe(altRoute.geometry);
  });

  it('says nothing when the saving is too small', async () => {
    // 45 + 8 = 53 against 50: saves 3, under the 5-minute minimum.
    const b = await build({ congestion: waitOnCurrentRoute(8) });
    expect(await offerOf(b.deps, b.input)).toBeNull();
  });

  it('wants 10% of the time left when that is more than 5 minutes', async () => {
    // 45 + 10.5 = 55.5 against 50 saves 5.5: over 5, but under 10% of 55.5.
    const short = await build({ congestion: waitOnCurrentRoute(10.5) });
    expect(await offerOf(short.deps, short.input)).toBeNull();
    // 45 + 11 = 56 against 50 saves 6: over 10% of 56.
    const enough = await build({ congestion: waitOnCurrentRoute(11) });
    expect(await offerOf(enough.deps, enough.input)).toMatchObject({ savingMinutes: 6 });
  });

  it('counts the provider delay when both routes have enough readings', async () => {
    const b = await build();
    b.traffic.delayFor = (line) =>
      line.some((p) => p.lon === -2.0)
        ? { delaySeconds: 20 * 60, coverage: 1 }
        : { delaySeconds: 0, coverage: 0.9 };
    expect(await offerOf(b.deps, b.input)).toMatchObject({ savingMinutes: 15 });
  });

  it('ignores the provider delay when the other route has too few readings', async () => {
    const b = await build();
    b.traffic.delayFor = (line) =>
      line.some((p) => p.lon === -2.0)
        ? { delaySeconds: 20 * 60, coverage: 1 }
        : { delaySeconds: 0, coverage: 0.1 };
    expect(await offerOf(b.deps, b.input)).toBeNull();
  });

  it('never offers a route that still passes a blocking hazard', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    b.hazards.obstructions = [
      {
        id: 'bridge',
        kind: 'height',
        limit: 3.5,
        zone: { points: [{ lat: 55.1, lon: -1.95 }] },
      },
    ];
    expect(await offerOf(b.deps, b.input)).toBeNull();
  });

  it('never offers a route through a road that is shut when the driver would get there', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    const shut = altPoints.slice(10, 14);
    (b.deps.closureAvoidanceQuery as FakeClosureAvoidanceQuery).candidates = [
      {
        id: 'c1',
        kind: 'full',
        description: 'closed',
        startsAt: new Date('2026-10-10T08:00:00.000Z'),
        endsAt: new Date('2026-10-10T20:00:00.000Z'),
        position: shut[0] as GeoPoint,
        lines: [shut],
      },
    ];
    expect(await offerOf(b.deps, b.input)).toBeNull();
  });

  it('asks the engine to avoid hazards that block this vehicle', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    const zone = { points: [{ lat: 55.1, lon: -2.2 }] };
    b.hazards.obstructions = [{ id: 'bridge', kind: 'height', limit: 3.5, zone }];
    await offerOf(b.deps, b.input);
    expect(b.engine.alternativesRequests[0]?.avoid).toEqual([zone]);
    expect(b.engine.alternativesRequests[0]?.origin).toEqual(start);
    expect(b.engine.alternativesRequests[0]?.dimensions).toEqual(dimensions);
  });

  it('asks for alternatives that avoid tolls, and never offers one with a toll, when the driver chose a route for having none', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    b.engine.alternativesResult = ok([{ ...altRoute, hasToll: true }]);
    b.engine.result = ok({ ...altRoute, hasToll: true });
    expect(await offerOf(b.deps, { ...b.input, avoidTolls: true })).toBeNull();
    expect(b.engine.alternativesRequests[0]).toMatchObject({ avoidTolls: true });
  });

  it('offers one with no toll when avoiding tolls, and says so when an offer does have a toll', async () => {
    const free = await build({ congestion: waitOnCurrentRoute(20) });
    free.engine.alternativesResult = ok([{ ...altRoute, hasToll: false }]);
    free.engine.result = ok({ ...altRoute, hasToll: false });
    const offered = await offerOf(free.deps, { ...free.input, avoidTolls: true });
    expect(offered).not.toBeNull();
    expect(offered).not.toHaveProperty('hasToll');

    const tolled = await build({ congestion: waitOnCurrentRoute(20) });
    tolled.engine.alternativesResult = ok([{ ...altRoute, hasToll: true }]);
    tolled.engine.result = ok({ ...altRoute, hasToll: true });
    expect(await offerOf(tolled.deps, tolled.input)).toMatchObject({ hasToll: true });
    expect(tolled.engine.alternativesRequests[0]).not.toHaveProperty('avoidTolls');
  });

  it('does not offer a route the driver already kept their own over', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    const first = await offerOf(b.deps, b.input);
    const again = await offerOf(b.deps, {
      ...b.input,
      keptKeys: [first?.key as string],
    });
    expect(again).toBeNull();
  });

  it('keeps to one offer every 10 minutes and three an hour', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    expect(await offerOf(b.deps, b.input)).not.toBeNull();
    b.clock.advance(5 * 60_000);
    expect(await offerOf(b.deps, b.input)).toBeNull();
    b.clock.advance(6 * 60_000);
    expect(await offerOf(b.deps, b.input)).not.toBeNull();
    b.clock.advance(11 * 60_000);
    expect(await offerOf(b.deps, b.input)).not.toBeNull();
    b.clock.advance(11 * 60_000);
    expect(await offerOf(b.deps, b.input)).toBeNull(); // third in the hour was the last
  });

  it('says nothing once the driver has left the planned route', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    const away = { lat: 55.1, lon: -1.9 }; // about 6 km east of the line
    expect(await offerOf(b.deps, { ...b.input, position: away })).toBeNull();
  });

  it('says nothing in the last few minutes of the trip', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    const nearEnd = currentPoints[37] as GeoPoint; // about 3 km left, roughly 3 minutes
    expect(await offerOf(b.deps, { ...b.input, position: nearEnd })).toBeNull();
  });

  it('says nothing for an ended trip, and 404s another driver', async () => {
    const ended = await build({ congestion: waitOnCurrentRoute(20), ended: true });
    expect(await offerOf(ended.deps, ended.input)).toBeNull();
    const b = await build();
    const result = await checkFasterRoute(b.deps, {
      ...b.input,
      driverId: makeId<'DriverId'>('someone-else'),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'ActiveTripNotFound' } });
  });

  it('says nothing when the engine finds no alternative', async () => {
    const b = await build({ congestion: waitOnCurrentRoute(20) });
    b.engine.alternativesResult = { ok: false, error: { tag: 'NoRouteFound' } };
    b.engine.result = { ok: false, error: { tag: 'NoRouteFound' } };
    expect(await offerOf(b.deps, b.input)).toBeNull();
  });

  describe('for a loaded vehicle', () => {
    /** Heights every 100 m along 5 km: flat, except a steep climb of `gradePct` between 1 km and 3 km. */
    const heights = (gradePct: number) => {
      const out = [];
      let h = 100;
      for (let m = 0; m <= 5000; m += 100) {
        if (m > 1000 && m <= 3000) h += gradePct;
        out.push({ distanceM: m, heightM: h });
      }
      return out;
    };

    it('does not offer a quicker route that adds steep hills', async () => {
      const b = await build({ congestion: waitOnCurrentRoute(20) });
      b.engine.profiles.set(plan.geometry, heights(0));
      b.engine.profiles.set(altRoute.geometry, heights(8));
      expect(await offerOf(b.deps, { ...b.input, loaded: true })).toBeNull();
    });

    it('still offers a quicker route that is no hillier', async () => {
      const b = await build({ congestion: waitOnCurrentRoute(20) });
      b.engine.profiles.set(plan.geometry, heights(8));
      b.engine.profiles.set(altRoute.geometry, heights(8));
      expect(await offerOf(b.deps, { ...b.input, loaded: true })).toMatchObject({
        savingMinutes: 15,
      });
    });

    it('does not look at hills for an empty vehicle', async () => {
      const b = await build({ congestion: waitOnCurrentRoute(20) });
      b.engine.profiles.set(plan.geometry, heights(0));
      b.engine.profiles.set(altRoute.geometry, heights(8));
      expect(await offerOf(b.deps, b.input)).toMatchObject({ savingMinutes: 15 });
      expect(b.engine.profileRequests).toEqual([]);
    });

    it('offers as before when the engine has no height data', async () => {
      const b = await build({ congestion: waitOnCurrentRoute(20) });
      expect(await offerOf(b.deps, { ...b.input, loaded: true })).toMatchObject({
        savingMinutes: 15,
      });
    });
  });
});
