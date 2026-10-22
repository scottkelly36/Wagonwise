import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { RouteCamera } from '../domain/route-camera.js';
import type { RoutePlan } from '../domain/route-plan.js';
import { getRouteCameras } from './get-route-cameras.js';
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
  const cameras: RouteCamera[] = [
    { id: 'c1', location: { lat: 54.97, lon: -2.1 }, kind: 'fixed', maxspeedMph: 40 },
  ];
  return {
    asked,
    deps: {
      routePlanRepo,
      camerasOnRoute: {
        camerasNear: (route: string) => {
          asked.push(route);
          return Promise.resolve(cameras);
        },
      },
    },
  };
}

describe('getRouteCameras', () => {
  it("finds the cameras along the owner's route", async () => {
    const { deps, asked } = await setup();
    const result = await getRouteCameras(deps, { id: planId, driverId });
    expect(result.ok && result.value.map((c) => c.id)).toEqual(['c1']);
    expect(asked).toEqual([plan.geometry]);
  });

  it("does not look, or reveal, another driver's route or an unknown one", async () => {
    const { deps, asked } = await setup();
    const other = await getRouteCameras(deps, {
      id: planId,
      driverId: makeId<'DriverId'>('driver-2'),
    });
    const unknown = await getRouteCameras(deps, { id: makeId<'RoutePlanId'>('nope'), driverId });
    expect(other).toEqual({ ok: false, error: { tag: 'RoutePlanNotFound' } });
    expect(unknown).toEqual({ ok: false, error: { tag: 'RoutePlanNotFound' } });
    expect(asked).toEqual([]);
  });
});
