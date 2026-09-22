import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
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
});
