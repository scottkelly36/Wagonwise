import { err } from '../../../shared/result.js';
import { describe, expect, it } from 'vitest';
import { estimateRoute } from './estimate-route.js';
import { FakeRoutingEngine } from './testing/fake-routing-engine.js';

const origin = { lat: 54.9707, lon: -2.1013 };
const destination = { lat: 54.9738, lon: -2.0165 };
const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

describe('estimateRoute', () => {
  it('returns the engine’s route, asked for with the vehicle’s dimensions and nothing avoided', async () => {
    const routingEngine = new FakeRoutingEngine();

    const result = await estimateRoute({ routingEngine }, { origin, destination, dimensions });

    expect(result).toEqual({
      ok: true,
      value: { geometry: 'fake-geometry', distanceKm: 10, durationMin: 15 },
    });
    expect(routingEngine.requests).toEqual([{ origin, destination, dimensions, avoid: [] }]);
  });

  it('passes through NoRouteFound when the vehicle cannot get there', async () => {
    const routingEngine = new FakeRoutingEngine();
    routingEngine.result = err({ tag: 'NoRouteFound' });

    expect(await estimateRoute({ routingEngine }, { origin, destination, dimensions })).toEqual({
      ok: false,
      error: { tag: 'NoRouteFound' },
    });
  });
});
