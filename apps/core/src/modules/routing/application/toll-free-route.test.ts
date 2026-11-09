import { describe, expect, it } from 'vitest';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { FakeRoutingEngine } from './testing/fake-routing-engine.js';
import { anyHasToll, findTollFreeRoute } from './toll-free-route.js';

const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const request = {
  origin: { lat: 54.9707, lon: -2.1013 },
  destination: { lat: 54.9738, lon: -2.0165 },
  dimensions,
  avoid: [],
};
const route = (geometry: string, hasToll?: boolean) => ({
  geometry,
  distanceKm: 10,
  durationMin: 15,
  maneuvers: [],
  ...(hasToll === undefined ? {} : { hasToll }),
});

describe('anyHasToll', () => {
  it('is true only when a route says it has a toll', () => {
    expect(anyHasToll([route('a', false), route('b')])).toBe(false);
    expect(anyHasToll([route('a', false), route('b', true)])).toBe(true);
  });
});

describe('findTollFreeRoute', () => {
  it('asks the engine to avoid tolls, with the same request, when a route has a toll', async () => {
    const engine = new FakeRoutingEngine();
    engine.result = { ok: true, value: route('no-toll', false) };

    const found = await findTollFreeRoute(engine, request, [route('fast', true)]);

    expect(found?.geometry).toBe('no-toll');
    expect(engine.requests).toEqual([{ ...request, avoidTolls: true }]);
  });

  it('does not ask when no route has a toll', async () => {
    const engine = new FakeRoutingEngine();
    expect(
      await findTollFreeRoute(engine, request, [route('fast', false), route('b')]),
    ).toBeUndefined();
    expect(engine.requests).toEqual([]);
  });

  it('offers nothing when the route it finds still has a toll: the journey needs one', async () => {
    const engine = new FakeRoutingEngine();
    engine.result = { ok: true, value: route('still-toll', true) };
    expect(await findTollFreeRoute(engine, request, [route('fast', true)])).toBeUndefined();
  });

  it('offers nothing when the engine finds no route', async () => {
    const engine = new FakeRoutingEngine();
    engine.result = { ok: false, error: { tag: 'NoRouteFound' } };
    expect(await findTollFreeRoute(engine, request, [route('fast', true)])).toBeUndefined();
  });
});
