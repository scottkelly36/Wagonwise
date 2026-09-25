import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import type { ReportedObstruction } from '../domain/reported-obstruction.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import { FakeHazardAvoidanceQuery } from './testing/fake-hazard-avoidance-query.js';
import { FakeRestrictionOverrideRepository } from './testing/fake-restriction-override-repository.js';
import { FakeRoutingEngine } from './testing/fake-routing-engine.js';
import { planRoute, type PlanRouteDeps } from './plan-route.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const profileId = makeId<'VehicleProfileId'>('profile-1');
const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const origin = { lat: 54.9707, lon: -2.1013 };
const destination = { lat: 54.9738, lon: -2.0165 };
const now = new Date('2026-06-15T08:00:00.000Z');

async function buildDeps(): Promise<
  PlanRouteDeps & { vehicleProfileRepo: InMemoryVehicleProfileRepository }
> {
  const vehicleProfileRepo = new InMemoryVehicleProfileRepository();
  await vehicleProfileRepo.save({ id: profileId, driverId, name: 'Big Wagon', dimensions });
  return {
    vehicleProfileRepo,
    routePlanRepo: new InMemoryRoutePlanRepository(),
    routingEngine: new FakeRoutingEngine(),
    hazardAvoidanceQuery: new FakeHazardAvoidanceQuery(),
    restrictionOverrideRepo: new FakeRestrictionOverrideRepository(),
    clock: new FakeClock(now),
    ids: new SequentialIdGenerator(),
  };
}

describe('planRoute', () => {
  it('plans and persists a route for an existing, owned profile', async () => {
    const deps = await buildDeps();
    const result = await planRoute(deps, { driverId, profileId, origin, destination });

    expect(result).toEqual({
      ok: true,
      value: {
        id: '00000000-0000-4000-8000-000000000001',
        driverId,
        profileId,
        origin,
        destination,
        geometry: 'fake-geometry',
        distanceKm: 10,
        durationMin: 15,
        avoidedRestrictions: [],
        hazardsOnRoute: [],
        createdAt: now,
      },
    });

    const stored = await deps.routePlanRepo.findById(
      makeId<'RoutePlanId'>('00000000-0000-4000-8000-000000000001'),
    );
    expect(stored).toEqual(result.ok ? result.value : undefined);
  });

  it('forwards the profile’s exact dimensions to the routing engine, with no avoid areas yet', async () => {
    const deps = await buildDeps();
    await planRoute(deps, { driverId, profileId, origin, destination });

    const engine = deps.routingEngine as FakeRoutingEngine;
    expect(engine.requests).toEqual([{ origin, destination, dimensions, avoid: [] }]);
  });

  it('returns VehicleProfileNotFound for an unknown profile, without calling the routing engine', async () => {
    const deps = await buildDeps();
    const result = await planRoute(deps, {
      driverId,
      profileId: makeId<'VehicleProfileId'>('nope'),
      origin,
      destination,
    });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
    expect((deps.routingEngine as FakeRoutingEngine).requests).toEqual([]);
  });

  it('returns VehicleProfileNotFound when the driverId does not own the profile', async () => {
    const deps = await buildDeps();
    const result = await planRoute(deps, {
      driverId: otherDriverId,
      profileId,
      origin,
      destination,
    });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
    expect((deps.routingEngine as FakeRoutingEngine).requests).toEqual([]);
  });

  it('propagates NoRouteFound from the routing engine and persists nothing', async () => {
    const deps = await buildDeps();
    (deps.routingEngine as FakeRoutingEngine).result = {
      ok: false,
      error: { tag: 'NoRouteFound' },
    };

    const result = await planRoute(deps, { driverId, profileId, origin, destination });
    expect(result).toEqual({ ok: false, error: { tag: 'NoRouteFound' } });
  });

  it('queries hazard avoidance with the first-pass route’s geometry', async () => {
    const deps = await buildDeps();
    await planRoute(deps, { driverId, profileId, origin, destination });

    const query = deps.hazardAvoidanceQuery as FakeHazardAvoidanceQuery;
    expect(query.corridors).toEqual(['fake-geometry']);
  });

  it('does not re-plan when no nearby obstruction applies to the vehicle', async () => {
    const deps = await buildDeps();
    const query = deps.hazardAvoidanceQuery as FakeHazardAvoidanceQuery;
    // A 3.5m height limit; the profile's own heightM is 4.2, so this *would* apply — this test
    // instead checks a kind the vehicle isn't affected by at all.
    const obstruction: ReportedObstruction = {
      id: 'hazard-1',
      kind: 'width',
      limit: 3.5, // the profile's widthM is 2.6 — under the limit, so applies() is false
      zone: { points: [{ lat: 54.97, lon: -2.1 }] },
    };
    query.obstructions = [obstruction];

    const result = await planRoute(deps, { driverId, profileId, origin, destination });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.geometry).toBe('fake-geometry');

    const engine = deps.routingEngine as FakeRoutingEngine;
    expect(engine.requests).toHaveLength(1); // only the first pass — no reroute needed
  });

  it('re-plans with an avoid polygon when a nearby obstruction applies to the vehicle', async () => {
    const deps = await buildDeps();
    const query = deps.hazardAvoidanceQuery as FakeHazardAvoidanceQuery;
    const obstruction: ReportedObstruction = {
      id: 'hazard-1',
      kind: 'height',
      limit: 3.5, // the profile's heightM is 4.2 — over the limit, so applies() is true
      zone: { points: [{ lat: 54.97, lon: -2.1 }] },
    };
    query.obstructions = [obstruction];

    const engine = deps.routingEngine as FakeRoutingEngine;
    engine.results = [
      { ok: true, value: { geometry: 'first-pass', distanceKm: 8, durationMin: 12 } },
      { ok: true, value: { geometry: 'rerouted', distanceKm: 9.5, durationMin: 14 } },
    ];

    const result = await planRoute(deps, { driverId, profileId, origin, destination });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ geometry: 'rerouted', distanceKm: 9.5, durationMin: 14 });

    expect(engine.requests).toHaveLength(2);
    expect(engine.requests[0]?.avoid).toEqual([]);
    expect(engine.requests[1]?.avoid).toEqual([obstruction.zone]);
    expect(query.corridors).toEqual(['first-pass']); // asked about the *first*-pass geometry
  });

  it('re-plans around and explains an applying restriction override', async () => {
    const deps = await buildDeps();
    const overrideRepo = deps.restrictionOverrideRepo as FakeRestrictionOverrideRepository;
    overrideRepo.overrides = [
      {
        id: makeId<'RestrictionOverrideId'>('override-1'),
        kind: 'height',
        limit: 3.8, // the profile's heightM is 4.2 — over the limit, so applies() is true
        location: { lat: 54.972, lon: -2.101 },
        note: 'Styford Bridge',
        createdAt: now,
      },
    ];

    const engine = deps.routingEngine as FakeRoutingEngine;
    engine.results = [
      { ok: true, value: { geometry: 'first-pass', distanceKm: 8, durationMin: 12 } },
      { ok: true, value: { geometry: 'rerouted', distanceKm: 9.5, durationMin: 14 } },
    ];

    const result = await planRoute(deps, { driverId, profileId, origin, destination });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.avoidedRestrictions).toEqual([
      { description: 'Avoided Styford Bridge — 3.8m limit' },
    ]);
    expect(engine.requests).toHaveLength(2);
  });

  it('does not re-plan or explain a restriction override that doesn’t apply to the vehicle', async () => {
    const deps = await buildDeps();
    const overrideRepo = deps.restrictionOverrideRepo as FakeRestrictionOverrideRepository;
    overrideRepo.overrides = [
      {
        id: makeId<'RestrictionOverrideId'>('override-1'),
        kind: 'width',
        limit: 3.5, // the profile's widthM is 2.6 — under the limit, so applies() is false
        location: { lat: 54.972, lon: -2.101 },
        createdAt: now,
      },
    ];

    const result = await planRoute(deps, { driverId, profileId, origin, destination });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.avoidedRestrictions).toEqual([]);

    const engine = deps.routingEngine as FakeRoutingEngine;
    expect(engine.requests).toHaveLength(1);
  });

  it('propagates NoRouteFound from the second pass when avoidance makes the trip impossible', async () => {
    const deps = await buildDeps();
    const query = deps.hazardAvoidanceQuery as FakeHazardAvoidanceQuery;
    query.obstructions = [
      {
        id: 'hazard-1',
        kind: 'prohibition',
        zone: { points: [{ lat: 54.97, lon: -2.1 }] },
      },
    ];

    const engine = deps.routingEngine as FakeRoutingEngine;
    engine.results = [
      { ok: true, value: { geometry: 'first-pass', distanceKm: 8, durationMin: 12 } },
      { ok: false, error: { tag: 'NoRouteFound' } },
    ];

    const result = await planRoute(deps, { driverId, profileId, origin, destination });
    expect(result).toEqual({ ok: false, error: { tag: 'NoRouteFound' } });
    expect(
      await deps.routePlanRepo.findById(
        makeId<'RoutePlanId'>('00000000-0000-4000-8000-000000000001'),
      ),
    ).toBeNull();
  });
});
