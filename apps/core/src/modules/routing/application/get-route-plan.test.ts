import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { RoutePlan } from '../domain/route-plan.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';
import { getRoutePlan, type GetRoutePlanDeps } from './get-route-plan.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
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
  hazardsOnRoute: [],
  createdAt: new Date('2026-09-24T09:00:00Z'),
};

async function seeded(): Promise<GetRoutePlanDeps> {
  const routePlanRepo = new InMemoryRoutePlanRepository();
  await routePlanRepo.save(plan);
  return { routePlanRepo };
}

describe('getRoutePlan', () => {
  it('returns the plan when it exists and is owned by the caller', async () => {
    const deps = await seeded();
    const result = await getRoutePlan(deps, { id: planId, driverId });
    expect(result).toEqual({ ok: true, value: plan });
  });

  it('returns RoutePlanNotFound for an unknown id', async () => {
    const deps = await seeded();
    const result = await getRoutePlan(deps, { id: makeId<'RoutePlanId'>('nope'), driverId });
    expect(result).toEqual({ ok: false, error: { tag: 'RoutePlanNotFound' } });
  });

  it('returns RoutePlanNotFound when the driverId does not match, not the plan', async () => {
    const deps = await seeded();
    const result = await getRoutePlan(deps, { id: planId, driverId: otherDriverId });
    expect(result).toEqual({ ok: false, error: { tag: 'RoutePlanNotFound' } });
  });
});
