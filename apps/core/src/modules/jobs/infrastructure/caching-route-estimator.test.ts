import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type {
  JobRouteEstimator,
  RouteEstimate,
  RouteUnavailable,
} from '../application/ports/route-estimator.js';
import { CachingRouteEstimator, ROUTE_ESTIMATE_TTL_MS } from './caching-route-estimator.js';

const vehicle = makeId<'FleetVehicleId'>('vehicle-1');
const from = { lat: 54.9707, lon: -2.1013 };
const to = { lat: 55.0, lon: -1.6 };
const estimate: RouteEstimate = { distanceKm: 40, durationMin: 50, geometry: 'line' };

class CountingEstimator implements JobRouteEstimator {
  calls = 0;
  result: Result<RouteEstimate, RouteUnavailable> = ok(estimate);
  estimate(): Promise<Result<RouteEstimate, RouteUnavailable>> {
    this.calls += 1;
    return Promise.resolve(this.result);
  }
}

describe('CachingRouteEstimator', () => {
  it('asks the engine once for repeated requests inside the window', async () => {
    const inner = new CountingEstimator();
    const clock = new FakeClock();
    const cache = new CachingRouteEstimator(inner, clock);

    await cache.estimate({ vehicleId: vehicle, from, to });
    clock.advance(60_000);
    const again = await cache.estimate({ vehicleId: vehicle, from, to });

    expect(inner.calls).toBe(1);
    expect(again).toEqual(ok(estimate));
  });

  it('treats a position a few metres away as the same request, and one well along the road as new', async () => {
    const inner = new CountingEstimator();
    const cache = new CachingRouteEstimator(inner, new FakeClock());

    await cache.estimate({ vehicleId: vehicle, from, to });
    await cache.estimate({ vehicleId: vehicle, from: { lat: 54.97072, lon: -2.10131 }, to });
    expect(inner.calls).toBe(1);

    await cache.estimate({ vehicleId: vehicle, from: { lat: 54.99, lon: -2.0 }, to });
    expect(inner.calls).toBe(2);
  });

  it('asks again once the window has passed', async () => {
    const inner = new CountingEstimator();
    const clock = new FakeClock();
    const cache = new CachingRouteEstimator(inner, clock);

    await cache.estimate({ vehicleId: vehicle, from, to });
    clock.advance(ROUTE_ESTIMATE_TTL_MS + 1);
    await cache.estimate({ vehicleId: vehicle, from, to });

    expect(inner.calls).toBe(2);
  });

  it('keeps vehicles apart', async () => {
    const inner = new CountingEstimator();
    const cache = new CachingRouteEstimator(inner, new FakeClock());

    await cache.estimate({ vehicleId: vehicle, from, to });
    await cache.estimate({ vehicleId: makeId<'FleetVehicleId'>('vehicle-2'), from, to });

    expect(inner.calls).toBe(2);
  });

  it('remembers “no route” as well, so an impossible job does not re-plan on every poll', async () => {
    const inner = new CountingEstimator();
    inner.result = err({ tag: 'RouteUnavailable' });
    const cache = new CachingRouteEstimator(inner, new FakeClock());

    await cache.estimate({ vehicleId: vehicle, from, to });
    const again = await cache.estimate({ vehicleId: vehicle, from, to });

    expect(inner.calls).toBe(1);
    expect(again.ok).toBe(false);
  });

  it('does not cache a thrown fault, so it recovers as soon as the engine does', async () => {
    let fail = true;
    const inner: JobRouteEstimator = {
      estimate: () =>
        fail ? Promise.reject(new Error('valhalla down')) : Promise.resolve(ok(estimate)),
    };
    const cache = new CachingRouteEstimator(inner, new FakeClock());

    await expect(cache.estimate({ vehicleId: vehicle, from, to })).rejects.toThrow('valhalla down');
    fail = false;
    expect(await cache.estimate({ vehicleId: vehicle, from, to })).toEqual(ok(estimate));
  });
});
