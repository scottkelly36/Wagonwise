import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import { FakeRoutingEngine } from './testing/fake-routing-engine.js';
import { previewRouteOptions, type PreviewRouteOptionsDeps } from './preview-route-options.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const profileId = makeId<'VehicleProfileId'>('profile-1');
const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const origin = { lat: 54.9707, lon: -2.1013 };
const destination = { lat: 54.9738, lon: -2.0165 };

async function buildDeps(
  fuelConsumptionL100km?: number,
): Promise<PreviewRouteOptionsDeps & { vehicleProfileRepo: InMemoryVehicleProfileRepository }> {
  const vehicleProfileRepo = new InMemoryVehicleProfileRepository();
  await vehicleProfileRepo.save({
    id: profileId,
    driverId,
    name: 'Big Wagon',
    dimensions,
    ...(fuelConsumptionL100km === undefined ? {} : { fuelConsumptionL100km }),
  });
  return {
    vehicleProfileRepo,
    routingEngine: new FakeRoutingEngine(),
    fuelPricePerLitreGBP: 1.6,
  };
}

describe('previewRouteOptions', () => {
  it('labels and costs the alternatives the engine returns', async () => {
    const deps = await buildDeps(30);
    (deps.routingEngine as FakeRoutingEngine).alternativesResult = {
      ok: true,
      value: [
        { geometry: 'fast-geometry', distanceKm: 120, durationMin: 90 },
        { geometry: 'short-geometry', distanceKm: 80, durationMin: 110 },
      ],
    };

    const result = await previewRouteOptions(deps, { driverId, profileId, origin, destination });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          geometry: 'fast-geometry',
          distanceKm: 120,
          durationMin: 90,
          estimatedFuelCostGBP: 120 * 0.3 * 1.6,
          labels: ['fastest'],
        },
        {
          geometry: 'short-geometry',
          distanceKm: 80,
          durationMin: 110,
          estimatedFuelCostGBP: 80 * 0.3 * 1.6,
          labels: ['shortest'],
        },
      ],
    });
  });

  it('omits estimatedFuelCostGBP when the profile has no fuelConsumptionL100km', async () => {
    const deps = await buildDeps();
    const result = await previewRouteOptions(deps, { driverId, profileId, origin, destination });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.every((o) => o.estimatedFuelCostGBP === undefined)).toBe(true);
  });

  it('returns VehicleProfileNotFound for an unknown profile, without calling the routing engine', async () => {
    const deps = await buildDeps();
    const engine = deps.routingEngine as FakeRoutingEngine;
    const result = await previewRouteOptions(deps, {
      driverId,
      profileId: makeId<'VehicleProfileId'>('nope'),
      origin,
      destination,
    });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
    expect(engine.alternativesRequests).toEqual([]);
  });

  it('returns VehicleProfileNotFound when the driverId does not own the profile', async () => {
    const deps = await buildDeps();
    const result = await previewRouteOptions(deps, {
      driverId: otherDriverId,
      profileId,
      origin,
      destination,
    });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
  });

  it('propagates NoRouteFound from the routing engine', async () => {
    const deps = await buildDeps();
    (deps.routingEngine as FakeRoutingEngine).alternativesResult = {
      ok: false,
      error: { tag: 'NoRouteFound' },
    };
    const result = await previewRouteOptions(deps, { driverId, profileId, origin, destination });
    expect(result).toEqual({ ok: false, error: { tag: 'NoRouteFound' } });
  });
});
