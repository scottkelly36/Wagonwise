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
        { geometry: 'fast-geometry', distanceKm: 120, durationMin: 90, maneuvers: [] },
        { geometry: 'short-geometry', distanceKm: 80, durationMin: 110, maneuvers: [] },
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

  describe('costs and the Cheapest label', () => {
    // `null` is a vehicle with no fuel economy set (an omitted argument would take the default).
    async function previewCosts(costs?: boolean, fuelL100km: number | null = 30) {
      const deps = await buildDeps(fuelL100km === null ? undefined : fuelL100km);
      (deps.routingEngine as FakeRoutingEngine).alternativesResult = {
        ok: true,
        value: [
          { geometry: 'fast-geometry', distanceKm: 120, durationMin: 90, maneuvers: [] },
          { geometry: 'short-geometry', distanceKm: 80, durationMin: 110, maneuvers: [] },
        ],
      };
      return previewRouteOptions(deps, {
        driverId,
        profileId,
        origin,
        destination,
        ...(costs === undefined ? {} : { costs }),
      });
    }

    it('adds a cost to each option and marks the cheapest when the app asks', async () => {
      const result = await previewCosts(true);
      // 120 km is £57.60 of fuel; 80 km is £38.40: the shorter road is £19.20 cheaper.
      expect(result.ok && result.value.map((o) => [o.labels, o.cost?.totalGBP])).toEqual([
        [['fastest'], 57.6],
        [['shortest', 'cheapest'], 38.4],
      ]);
    });

    it('leaves costs and the Cheapest label off when the app did not ask: an older app cannot read the label', async () => {
      const result = await previewCosts();
      expect(result.ok && result.value.flatMap((o) => o.labels)).not.toContain('cheapest');
      expect(result.ok && result.value[0]).not.toHaveProperty('cost');
    });

    it('marks nothing when the vehicle has no fuel economy, though each cost still shows its charges', async () => {
      const result = await previewCosts(true, null);
      expect(result.ok && result.value.flatMap((o) => o.labels)).not.toContain('cheapest');
      expect(result.ok && result.value[0]?.cost).toEqual({ chargesGBP: 0 });
    });
  });

  describe('low emission zones', () => {
    // A test-only polyline6 encoder, separate from the shipped decoder, so a bug shared by both cannot hide behind a round trip.
    const enc = (value: number): string => {
      let shifted = value < 0 ? ~(value << 1) : value << 1;
      let chars = '';
      while (shifted >= 0x20) {
        chars += String.fromCharCode((shifted & 0x1f) + 0x20 + 63);
        shifted >>= 5;
      }
      return chars + String.fromCharCode(shifted + 63);
    };
    const encode = (points: readonly { lat: number; lon: number }[]): string =>
      points
        .map((p, i) => {
          const prev = points[i - 1] ?? { lat: 0, lon: 0 };
          return (
            enc(Math.round(p.lat * 1e6) - Math.round(prev.lat * 1e6)) +
            enc(Math.round(p.lon * 1e6) - Math.round(prev.lon * 1e6))
          );
        })
        .join('');
    // Two points either side of Glasgow city centre: a straight road through George Square with no point inside the zone.
    const throughGlasgow = encode([
      { lat: 55.8611, lon: -4.3 },
      { lat: 55.8611, lon: -4.2 },
    ]);
    const clearOfZones = encode([
      { lat: 54.9707, lon: -2.1013 },
      { lat: 54.9738, lon: -2.0165 },
    ]);

    // Two points either side of Sheffield city centre: a road through Fargate with no point inside the zone.
    const throughSheffield = encode([
      { lat: 53.3814, lon: -1.5 },
      { lat: 53.3814, lon: -1.43 },
    ]);

    async function previewWith(
      euroVI: boolean | undefined,
      geometry: string,
      dailyZones?: boolean,
    ) {
      const deps = await buildDeps();
      await deps.vehicleProfileRepo.save({
        id: profileId,
        driverId,
        name: 'Big Wagon',
        dimensions: { ...dimensions, ...(euroVI === undefined ? {} : { euroVI }) },
      });
      (deps.routingEngine as FakeRoutingEngine).alternativesResult = {
        ok: true,
        value: [{ geometry, distanceKm: 120, durationMin: 90, maneuvers: [] }],
      };
      return previewRouteOptions(deps, {
        driverId,
        profileId,
        origin,
        destination,
        ...(dailyZones === undefined ? {} : { dailyZones }),
      });
    }

    it('names an English zone, with its daily charge, when the app can show one', async () => {
      const result = await previewWith(undefined, throughSheffield, true);
      expect(result.ok && result.value[0]?.zones).toEqual([
        {
          id: 'sheffield',
          name: 'Sheffield Clean Air Zone',
          status: 'may-be-charged',
          charge: { kind: 'daily', lowGBP: 50, highGBP: 50 },
        },
      ]);
    });

    it('says nothing about an English zone to an app that cannot show a daily charge', async () => {
      const result = await previewWith(undefined, throughSheffield);
      expect(result.ok && result.value[0]).not.toHaveProperty('zones');
    });

    it('still names a Scottish zone, as before, to an app that cannot show a daily charge', async () => {
      const result = await previewWith(false, throughGlasgow);
      expect(result.ok && result.value[0]?.zones?.[0]).toMatchObject({
        id: 'glasgow',
        charge: { kind: 'penalty', firstGBP: 60 },
      });
    });

    it('says a vehicle that has not said whether it is Euro VI may be charged in a zone the route enters', async () => {
      const result = await previewWith(undefined, throughGlasgow);
      expect(result.ok && result.value[0]?.zones).toEqual([
        {
          id: 'glasgow',
          name: 'Glasgow Low Emission Zone',
          status: 'may-be-charged',
          charge: { kind: 'penalty', firstGBP: 60 },
        },
      ]);
    });

    it('says a vehicle that is not Euro VI is charged', async () => {
      const result = await previewWith(false, throughGlasgow);
      expect(result.ok && result.value[0]?.zones?.[0]?.status).toBe('charged');
    });

    it('says nothing about a zone for a Euro VI vehicle', async () => {
      const result = await previewWith(true, throughGlasgow);
      expect(result.ok && result.value[0]).not.toHaveProperty('zones');
    });

    it('says nothing for a route that stays out of the zones', async () => {
      const result = await previewWith(false, clearOfZones);
      expect(result.ok && result.value[0]).not.toHaveProperty('zones');
    });
  });

  describe('tolls', () => {
    const withToll = (geometry: string, hasToll: boolean, km: number, min: number) => ({
      geometry,
      distanceKm: km,
      durationMin: min,
      maneuvers: [],
      hasToll,
    });

    it('says which routes have a toll, and offers a toll-free one as its own card when the app asks', async () => {
      const deps = await buildDeps();
      const engine = deps.routingEngine as FakeRoutingEngine;
      engine.alternativesResult = {
        ok: true,
        value: [
          withToll('fast-geometry', true, 120, 90),
          withToll('short-geometry', true, 80, 110),
        ],
      };
      engine.result = { ok: true, value: withToll('free-geometry', false, 140, 100) };

      const result = await previewRouteOptions(deps, {
        driverId,
        profileId,
        origin,
        destination,
        tolls: true,
      });

      expect(result.ok && result.value.map((o) => [o.geometry, o.labels, o.hasToll])).toEqual([
        ['fast-geometry', ['fastest'], true],
        ['short-geometry', ['shortest'], true],
        ['free-geometry', ['toll-free'], false],
      ]);
      expect(engine.requests[0]).toMatchObject({ avoidTolls: true });
    });

    describe('what a toll costs', () => {
      const dartford = [{ lat: 51.4567, lon: 0.2474 }];
      const tolled = (geometry: string, tollPoints: readonly { lat: number; lon: number }[]) => ({
        ...withToll(geometry, true, 120, 90),
        tollPoints,
      });

      it('names the toll on a route and prices it for the vehicle’s weight when the app asks', async () => {
        const deps = await buildDeps();
        const engine = deps.routingEngine as FakeRoutingEngine;
        engine.alternativesResult = { ok: true, value: [tolled('fast-geometry', dartford)] };
        engine.result = { ok: true, value: withToll('free-geometry', false, 140, 100) };

        const result = await previewRouteOptions(deps, {
          driverId,
          profileId,
          origin,
          destination,
          tolls: true,
        });

        // The profile is a 32 tonne vehicle, so more than two axles.
        expect(result.ok && result.value[0]?.charges).toMatchObject([
          { id: 'dartford', name: 'Dartford Crossing', lowGBP: 8.4, highGBP: 8.4 },
        ]);
        // The toll-free route has no toll to name.
        expect(result.ok && result.value[1]?.charges).toBeUndefined();
      });

      it('leaves charges off when the app did not ask', async () => {
        const deps = await buildDeps();
        const engine = deps.routingEngine as FakeRoutingEngine;
        engine.alternativesResult = { ok: true, value: [tolled('fast-geometry', dartford)] };

        const result = await previewRouteOptions(deps, {
          driverId,
          profileId,
          origin,
          destination,
        });

        expect(result.ok && result.value[0]).not.toHaveProperty('charges');
      });

      it('says nothing more than "has a toll" for a toll the table does not know', async () => {
        const deps = await buildDeps();
        const engine = deps.routingEngine as FakeRoutingEngine;
        engine.alternativesResult = {
          ok: true,
          value: [tolled('fast-geometry', [{ lat: 52.0, lon: -1.0 }])],
        };
        engine.result = { ok: true, value: withToll('free-geometry', false, 140, 100) };

        const result = await previewRouteOptions(deps, {
          driverId,
          profileId,
          origin,
          destination,
          tolls: true,
        });

        expect(result.ok && result.value[0]?.hasToll).toBe(true);
        expect(result.ok && result.value[0]).not.toHaveProperty('charges');
      });
    });

    it('marks the engine’s own route when it is already the toll-free one, rather than adding a card', async () => {
      const deps = await buildDeps();
      const engine = deps.routingEngine as FakeRoutingEngine;
      engine.alternativesResult = {
        ok: true,
        value: [
          withToll('fast-geometry', true, 120, 90),
          withToll('short-geometry', false, 80, 110),
        ],
      };
      engine.result = { ok: true, value: withToll('short-geometry', false, 80, 110) };

      const result = await previewRouteOptions(deps, {
        driverId,
        profileId,
        origin,
        destination,
        tolls: true,
      });

      expect(result.ok && result.value.map((o) => o.labels)).toEqual([
        ['fastest'],
        ['shortest', 'toll-free'],
      ]);
    });

    it('leaves the options as they were when the app did not ask: an older app cannot read the new label', async () => {
      const deps = await buildDeps();
      const engine = deps.routingEngine as FakeRoutingEngine;
      engine.alternativesResult = {
        ok: true,
        value: [withToll('fast-geometry', true, 120, 90)],
      };

      const result = await previewRouteOptions(deps, { driverId, profileId, origin, destination });

      expect(result.ok && result.value.map((o) => o.labels)).toEqual([['fastest', 'shortest']]);
      expect(engine.requests).toEqual([]);
    });

    it('does not look for a toll-free route when none of the routes has a toll', async () => {
      const deps = await buildDeps();
      const engine = deps.routingEngine as FakeRoutingEngine;
      engine.alternativesResult = {
        ok: true,
        value: [withToll('fast-geometry', false, 120, 90)],
      };

      await previewRouteOptions(deps, { driverId, profileId, origin, destination, tolls: true });

      expect(engine.requests).toEqual([]);
    });
  });

  describe('when no route exists for the vehicle’s weight', () => {
    const noRoute = { ok: false, error: { tag: 'NoRouteFound' } } as const;
    const found = {
      ok: true,
      value: [{ geometry: 'light-route', distanceKm: 8, durationMin: 12, maneuvers: [] }],
    } as const;

    it('offers a route that ignores weight limits, marked so the driver is warned', async () => {
      const deps = await buildDeps();
      const engine = deps.routingEngine as FakeRoutingEngine;
      engine.alternativesResults = [noRoute, found];

      const result = await previewRouteOptions(deps, { driverId, profileId, origin, destination });

      expect(result.ok && result.value.map((o) => o.geometry)).toEqual(['light-route']);
      expect(result.ok && result.value.every((o) => o.breaksWeightLimit === true)).toBe(true);
      expect(engine.alternativesRequests).toHaveLength(2);
      expect(engine.alternativesRequests[0]?.dimensions).toEqual(dimensions);
      expect(engine.alternativesRequests[1]?.dimensions).toEqual({
        ...dimensions,
        grossWeightT: 3.5,
        axleWeightT: undefined,
      });
    });

    it('never relaxes height, width or length, so a route blocked by those stays "no route"', async () => {
      const deps = await buildDeps();
      const engine = deps.routingEngine as FakeRoutingEngine;
      engine.alternativesResults = [noRoute, noRoute];

      const result = await previewRouteOptions(deps, { driverId, profileId, origin, destination });

      expect(result).toEqual({ ok: false, error: { tag: 'NoRouteFound' } });
      const second = engine.alternativesRequests[1]?.dimensions;
      expect(second?.heightM).toBe(dimensions.heightM);
      expect(second?.widthM).toBe(dimensions.widthM);
      expect(second?.lengthM).toBe(dimensions.lengthM);
    });

    it('asks only once, and does not mark anything, when a route for the real weight exists', async () => {
      const deps = await buildDeps();
      const engine = deps.routingEngine as FakeRoutingEngine;

      const result = await previewRouteOptions(deps, { driverId, profileId, origin, destination });

      expect(engine.alternativesRequests).toHaveLength(1);
      expect(result.ok && result.value.some((o) => o.breaksWeightLimit !== undefined)).toBe(false);
    });
  });
});
