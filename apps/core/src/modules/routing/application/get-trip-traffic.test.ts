import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { GeoPoint } from '../domain/geo.js';
import type { RoutePlan } from '../domain/route-plan.js';
import { getTripTraffic, type GetTripTrafficDeps } from './get-trip-traffic.js';
import { encodePolyline } from './testing/encode-polyline.js';
import { FakeCongestionQuery } from './testing/fake-congestion-query.js';
import { FakeTrafficQuery } from './testing/fake-traffic-query.js';
import { InMemoryActiveTripRepository } from './testing/in-memory-active-trip-repository.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';

const driverId = makeId<'DriverId'>('driver-1');
const tripId = makeId<'ActiveTripId'>('trip-1');
const now = new Date('2026-10-22T09:00:00.000Z');

/** A line due north, one point every 0.01 degrees of latitude (about 1.1 km), 40 points. */
const line: GeoPoint[] = Array.from({ length: 40 }, (_, i) => ({ lat: 55 + i * 0.01, lon: -2 }));
const plan: RoutePlan = {
  id: makeId<'RoutePlanId'>('plan-1'),
  driverId,
  profileId: makeId<'VehicleProfileId'>('profile-1'),
  origin: line[0]!,
  destination: line.at(-1)!,
  geometry: encodePolyline(line),
  distanceKm: 43,
  durationMin: 45,
  avoidedRestrictions: [],
  maneuvers: [],
  hazardsOnRoute: [],
  createdAt: now,
};

async function build(options: { ended?: boolean } = {}) {
  const routePlanRepo = new InMemoryRoutePlanRepository();
  const activeTripRepo = new InMemoryActiveTripRepository(routePlanRepo);
  await routePlanRepo.save(plan);
  await activeTripRepo.save({
    id: tripId,
    routePlanId: plan.id,
    driverId,
    startedAt: now,
    ...(options.ended === true ? { endedAt: now } : {}),
  });
  const traffic = new FakeTrafficQuery();
  traffic.enabled = true;
  const congestion = new FakeCongestionQuery();
  const deps: GetTripTrafficDeps = {
    activeTripRepo,
    routePlanRepo,
    congestionQuery: congestion,
    trafficQuery: traffic,
  };
  return { deps, traffic, congestion };
}

const input = { driverId, tripId, position: line[10]! };

describe('getTripTraffic', () => {
  it('adds the traffic delay on the rest of the route, and says how much of it was read', async () => {
    const { deps, traffic } = await build();
    let seen: readonly GeoPoint[] = [];
    traffic.delayFor = (l) => {
      seen = l;
      return { delaySeconds: 600, coverage: 0.8 };
    };
    const result = await getTripTraffic(deps, input);
    expect(result).toEqual({ ok: true, value: { enabled: true, extraMinutes: 10, coverage: 0.8 } });
    // Only what is left of the route, from the lorry's position on.
    expect(seen[0]?.lat).toBeCloseTo(line[10]!.lat, 5);
    expect(seen).toHaveLength(30);
  });

  it("adds other drivers' congestion reports on the rest of the route", async () => {
    const { deps, traffic, congestion } = await build();
    traffic.delayFor = () => ({ delaySeconds: 120, coverage: 1 });
    congestion.waits = [{ id: 'c1', location: line[20]!, waitMinutes: 8 }];
    const result = await getTripTraffic(deps, input);
    expect(result.ok && result.value.extraMinutes).toBe(10);
  });

  it('says traffic is off when there is no provider, with no delay', async () => {
    const { deps, traffic } = await build();
    traffic.enabled = false;
    const result = await getTripTraffic(deps, input);
    expect(result).toEqual({ ok: true, value: { enabled: false, extraMinutes: 0, coverage: 0 } });
  });

  it('gives no delay when the lorry is off the route, or the trip has ended', async () => {
    const { deps, traffic } = await build();
    traffic.delayFor = () => ({ delaySeconds: 600, coverage: 1 });
    const off = await getTripTraffic(deps, { ...input, position: { lat: 55.2, lon: -1.5 } });
    expect(off.ok && off.value.extraMinutes).toBe(0);

    const ended = await build({ ended: true });
    ended.traffic.delayFor = () => ({ delaySeconds: 600, coverage: 1 });
    const done = await getTripTraffic(ended.deps, input);
    expect(done.ok && done.value.extraMinutes).toBe(0);
  });

  it("does not reveal another driver's trip or an unknown one", async () => {
    const { deps } = await build();
    const other = await getTripTraffic(deps, {
      ...input,
      driverId: makeId<'DriverId'>('driver-2'),
    });
    const unknown = await getTripTraffic(deps, {
      ...input,
      tripId: makeId<'ActiveTripId'>('nope'),
    });
    expect(other).toEqual({ ok: false, error: { tag: 'ActiveTripNotFound' } });
    expect(unknown).toEqual({ ok: false, error: { tag: 'ActiveTripNotFound' } });
  });
});
