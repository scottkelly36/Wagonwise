import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { RoutePlan } from '../domain/route-plan.js';
import { InMemoryActiveTripRepository } from './testing/in-memory-active-trip-repository.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';
import { startTrip, type StartTripDeps } from './start-trip.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const now = new Date('2026-06-15T08:00:00.000Z');

function plan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  return {
    id: makeId<'RoutePlanId'>('plan-1'),
    driverId,
    profileId: makeId<'VehicleProfileId'>('profile-1'),
    origin: { lat: 54.9707, lon: -2.1013 },
    destination: { lat: 54.9738, lon: -2.0165 },
    geometry: 'encoded-polyline',
    distanceKm: 8.038,
    durationMin: 7.9,
    avoidedRestrictions: [],
    maneuvers: [],
    hazardsOnRoute: [],
    createdAt: now,
    ...overrides,
  };
}

async function seeded(plans: RoutePlan[] = [plan()]): Promise<StartTripDeps> {
  const routePlanRepo = new InMemoryRoutePlanRepository();
  for (const p of plans) await routePlanRepo.save(p);
  return {
    routePlanRepo,
    activeTripRepo: new InMemoryActiveTripRepository(),
    clock: new FakeClock(now),
    ids: new SequentialIdGenerator(),
  };
}

describe('startTrip', () => {
  it('starts a trip from a route plan owned by the driver', async () => {
    const deps = await seeded();
    const result = await startTrip(deps, {
      driverId,
      routePlanId: makeId<'RoutePlanId'>('plan-1'),
    });
    expect(result).toEqual({
      ok: true,
      value: {
        id: '00000000-0000-4000-8000-000000000001',
        routePlanId: makeId<'RoutePlanId'>('plan-1'),
        driverId,
        startedAt: now,
      },
    });
  });

  it('returns RoutePlanNotFound for an unknown plan id', async () => {
    const deps = await seeded();
    const result = await startTrip(deps, {
      driverId,
      routePlanId: makeId<'RoutePlanId'>('nope'),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'RoutePlanNotFound' } });
  });

  it('returns RoutePlanNotFound when the plan belongs to a different driver', async () => {
    const deps = await seeded();
    const result = await startTrip(deps, {
      driverId: otherDriverId,
      routePlanId: makeId<'RoutePlanId'>('plan-1'),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'RoutePlanNotFound' } });
  });

  it('returns TripAlreadyActive when the driver already has a trip in progress', async () => {
    const deps = await seeded([plan(), plan({ id: makeId<'RoutePlanId'>('plan-2') })]);
    const first = await startTrip(deps, { driverId, routePlanId: makeId<'RoutePlanId'>('plan-1') });
    expect(first.ok).toBe(true);

    const second = await startTrip(deps, {
      driverId,
      routePlanId: makeId<'RoutePlanId'>('plan-2'),
    });
    expect(second).toEqual({ ok: false, error: { tag: 'TripAlreadyActive' } });
  });

  it('allows a different driver to start a trip while another driver has one active', async () => {
    const deps = await seeded([
      plan(),
      plan({ id: makeId<'RoutePlanId'>('plan-2'), driverId: otherDriverId }),
    ]);
    const first = await startTrip(deps, { driverId, routePlanId: makeId<'RoutePlanId'>('plan-1') });
    expect(first.ok).toBe(true);

    const second = await startTrip(deps, {
      driverId: otherDriverId,
      routePlanId: makeId<'RoutePlanId'>('plan-2'),
    });
    expect(second.ok).toBe(true);
  });
});
