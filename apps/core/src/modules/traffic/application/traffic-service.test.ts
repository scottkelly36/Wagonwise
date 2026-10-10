import { describe, expect, it } from 'vitest';
import type { BoundingBox, FlowReading, GeoPoint, TrafficIncident } from '../domain/traffic.js';
import type { TrafficProvider } from './traffic-provider.js';
import { TrafficService, type TrafficServiceOptions } from './traffic-service.js';

class FakeProvider implements TrafficProvider {
  flowCalls = 0;
  incidentCalls = 0;
  failing = false;
  constructor(
    private readonly reading: FlowReading | undefined = {
      currentSpeedKph: 30,
      freeFlowSpeedKph: 60,
      closed: false,
    },
    private readonly incidents: TrafficIncident[] = [],
  ) {}
  flowAt(_point: GeoPoint): Promise<FlowReading | undefined> {
    this.flowCalls += 1;
    if (this.failing) return Promise.reject(new Error('down'));
    return Promise.resolve(this.reading);
  }
  incidentsIn(_box: BoundingBox): Promise<TrafficIncident[]> {
    this.incidentCalls += 1;
    if (this.failing) return Promise.reject(new Error('down'));
    return Promise.resolve(this.incidents);
  }
}

const options: TrafficServiceOptions = {
  cacheTtlMs: 300_000,
  dailyRequestLimit: 100,
  sampleSpacingM: 5_000,
  maxSamplesPerRoute: 30,
};

// About 22 km due north: 0.2 degrees of latitude, a point every 0.02 (2.2 km).
const line: GeoPoint[] = Array.from({ length: 11 }, (_, i) => ({ lat: 55 + i * 0.02, lon: -2 }));

function clockAt(iso: string): { now(): Date; set(iso: string): void } {
  let t = new Date(iso);
  return { now: () => t, set: (v) => (t = new Date(v)) };
}

describe('TrafficService.delayAlong', () => {
  it('adds up the extra time at the current speed over the free-flow speed', async () => {
    const service = new TrafficService(
      new FakeProvider(),
      clockAt('2026-10-10T09:00:00Z'),
      options,
    );
    const result = await service.delayAlong(line);
    // 22.2 km at 30 km/h is 2664 s; at 60 km/h it is 1332 s. Extra is about 1332 s.
    expect(result.delaySeconds).toBeGreaterThan(1250);
    expect(result.delaySeconds).toBeLessThan(1420);
    expect(result.coverage).toBe(1);
  });

  it('plans on no saving when traffic is faster than free flow', async () => {
    const fast = new FakeProvider({ currentSpeedKph: 80, freeFlowSpeedKph: 60, closed: false });
    const service = new TrafficService(fast, clockAt('2026-10-10T09:00:00Z'), options);
    expect((await service.delayAlong(line)).delaySeconds).toBe(0);
  });

  it('reports no delay and no coverage without a provider', async () => {
    const service = new TrafficService(undefined, clockAt('2026-10-10T09:00:00Z'), options);
    expect(service.enabled).toBe(false);
    expect(await service.delayAlong(line)).toEqual({ delaySeconds: 0, incidents: [], coverage: 0 });
  });

  it('reuses readings within the cache time, and asks again after it', async () => {
    const provider = new FakeProvider();
    const clock = clockAt('2026-10-10T09:00:00Z');
    const service = new TrafficService(provider, clock, options);
    await service.delayAlong(line);
    const first = provider.flowCalls;
    await service.delayAlong(line);
    expect(provider.flowCalls).toBe(first);
    clock.set('2026-10-10T09:06:00Z');
    await service.delayAlong(line);
    expect(provider.flowCalls).toBe(first * 2);
  });

  it('stops calling the provider at the daily limit, and starts again the next day', async () => {
    const provider = new FakeProvider();
    const clock = clockAt('2026-10-10T09:00:00Z');
    const service = new TrafficService(provider, clock, { ...options, dailyRequestLimit: 3 });
    const result = await service.delayAlong(line);
    expect(provider.flowCalls + provider.incidentCalls).toBe(3);
    expect(result.coverage).toBeLessThan(1);
    expect(service.requestsToday).toBe(3);
    clock.set('2026-10-11T00:01:00Z');
    expect(service.requestsToday).toBe(0);
  });

  it('thins a long route instead of cutting it short', async () => {
    const provider = new FakeProvider();
    const service = new TrafficService(provider, clockAt('2026-10-10T09:00:00Z'), {
      ...options,
      sampleSpacingM: 1_000,
      maxSamplesPerRoute: 4,
    });
    const result = await service.delayAlong(line);
    expect(provider.flowCalls).toBeLessThanOrEqual(4);
    expect(result.coverage).toBe(1);
    expect(result.delaySeconds).toBeGreaterThan(1250);
  });

  it('survives a failing provider with lower coverage', async () => {
    const provider = new FakeProvider();
    provider.failing = true;
    const service = new TrafficService(provider, clockAt('2026-10-10T09:00:00Z'), options);
    expect(await service.delayAlong(line)).toEqual({ delaySeconds: 0, incidents: [], coverage: 0 });
  });

  it('returns the incidents beside the route', async () => {
    const incident: TrafficIncident = {
      id: 'i1',
      kind: 'accident',
      location: { lat: 55.1, lon: -2 },
      description: 'Accident',
      delaySeconds: 600,
    };
    const service = new TrafficService(
      new FakeProvider(undefined, [incident]),
      clockAt('2026-10-10T09:00:00Z'),
      options,
    );
    expect((await service.delayAlong(line)).incidents).toEqual([incident]);
  });
});
