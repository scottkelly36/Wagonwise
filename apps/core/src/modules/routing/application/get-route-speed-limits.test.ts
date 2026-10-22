import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { RoutePlan } from '../domain/route-plan.js';
import type { SpeedZone } from '../domain/speed-zone.js';
import { getRouteSpeedLimits } from './get-route-speed-limits.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';

const driverId = makeId<'DriverId'>('driver-1');
const planId = makeId<'RoutePlanId'>('plan-1');

const plan: RoutePlan = {
  id: planId,
  driverId,
  profileId: makeId<'VehicleProfileId'>('profile-1'),
  origin: { lat: 54.97, lon: -2.1 },
  destination: { lat: 54.98, lon: -2.05 },
  geometry: '_p~iF~ps|U',
  distanceKm: 7.6,
  durationMin: 12,
  avoidedRestrictions: [],
  maneuvers: [],
  hazardsOnRoute: [],
  createdAt: new Date('2026-09-24T09:00:00Z'),
};

async function setup() {
  const routePlanRepo = new InMemoryRoutePlanRepository();
  await routePlanRepo.save(plan);
  const asked: string[] = [];
  const zones: SpeedZone[] = [{ from: 0, to: 1, limitMph: 30 }];
  return {
    asked,
    deps: {
      routePlanRepo,
      speedLimits: {
        zonesAlong: (route: string) => {
          asked.push(route);
          return Promise.resolve(zones);
        },
      },
    },
  };
}

describe('getRouteSpeedLimits', () => {
  it("reads the limits along the owner's route", async () => {
    const { deps, asked } = await setup();
    expect(await getRouteSpeedLimits(deps, { id: planId, driverId })).toEqual({
      ok: true,
      value: [{ from: 0, to: 1, limitMph: 30 }],
    });
    expect(asked).toEqual([plan.geometry]);
  });

  it("does not read, or reveal, another driver's route or an unknown one", async () => {
    const { deps, asked } = await setup();
    const other = await getRouteSpeedLimits(deps, {
      id: planId,
      driverId: makeId<'DriverId'>('driver-2'),
    });
    const unknown = await getRouteSpeedLimits(deps, {
      id: makeId<'RoutePlanId'>('nope'),
      driverId,
    });
    expect(other).toEqual({ ok: false, error: { tag: 'RoutePlanNotFound' } });
    expect(unknown).toEqual({ ok: false, error: { tag: 'RoutePlanNotFound' } });
    expect(asked).toEqual([]);
  });
});
