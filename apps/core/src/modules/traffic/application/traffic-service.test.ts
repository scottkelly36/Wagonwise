import { describe, expect, it } from 'vitest';
import type { BoundingBox, FlowReading, GeoPoint, TrafficIncident } from '../domain/traffic.js';
import { ProviderRefused, type TrafficProvider } from './traffic-provider.js';
import { TrafficService, type TrafficServiceOptions } from './traffic-service.js';

class FakeProvider implements TrafficProvider {
  flowCalls = 0;
  incidentCalls = 0;
  failing = false;
  refusing = false;
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
    if (this.refusing) return Promise.reject(new ProviderRefused('not enough credits', 403));
    if (this.failing) return Promise.reject(new Error('down'));
    return Promise.resolve(this.reading);
  }
  incidentsIn(_box: BoundingBox): Promise<TrafficIncident[]> {
    this.incidentCalls += 1;
    if (this.refusing) return Promise.reject(new ProviderRefused('not enough credits', 403));
    if (this.failing) return Promise.reject(new Error('down'));
    return Promise.resolve(this.incidents);
  }
}

const options: TrafficServiceOptions = {
  cacheTtlMs: 300_000,
  dailyRequestLimit: 100,
  cellDegrees: 0.05,
  nearHorizonM: 60_000,
  farEvery: 3,
  incidentCacheTtlMs: 900_000,
  refusedPauseMs: 1_800_000,
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
    expect(await service.delayAlong(line)).toEqual({
      delaySeconds: 0,
      incidents: [],
      coverage: 0,
      stretches: [],
    });
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
      cellDegrees: 0.005,
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
    expect(await service.delayAlong(line)).toEqual({
      delaySeconds: 0,
      incidents: [],
      coverage: 0,
      stretches: [],
    });
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

describe('TrafficService spending', () => {
  it('reuses readings as the lorry moves along the route: the same road is the same cells, not new points', async () => {
    const provider = new FakeProvider();
    const clock = clockAt('2026-10-10T09:00:00Z');
    const service = new TrafficService(provider, clock, options);
    await service.delayAlong(line);
    const spent = provider.flowCalls + provider.incidentCalls;
    // Four minutes on, the lorry is three points further along and asks again with what is left of the route.
    clock.set('2026-10-10T09:04:00Z');
    const later = await service.delayAlong(line.slice(3));
    expect(provider.flowCalls + provider.incidentCalls).toBe(spent);
    expect(later.coverage).toBe(1);
  });

  it('shares a reading between two drivers on the same road', async () => {
    const provider = new FakeProvider();
    const service = new TrafficService(provider, clockAt('2026-10-10T09:00:00Z'), options);
    await service.delayAlong(line);
    const spent = provider.flowCalls;
    // Another driver, joining the same road a little further on, with a slightly different line.
    await service.delayAlong(line.slice(5).map((p) => ({ lat: p.lat, lon: p.lon + 0.0004 })));
    expect(provider.flowCalls).toBe(spent);
  });

  it('reads the road just ahead in full and the road far ahead one reading for each few cells', async () => {
    // About 330 km north: 3 degrees of latitude, a point every 0.01 degree, so a new 0.05 degree cell every 5 points.
    const long: GeoPoint[] = Array.from({ length: 301 }, (_, i) => ({
      lat: 52 + i * 0.01,
      lon: -2,
    }));
    const provider = new FakeProvider();
    const service = new TrafficService(provider, clockAt('2026-10-10T09:00:00Z'), {
      ...options,
      maxSamplesPerRoute: 200,
    });
    const result = await service.delayAlong(long);
    // 60 cells in all. 60 km is about 11 cells read one by one, and the other 49 are read one in three, so about 28 readings, not 60.
    expect(provider.flowCalls).toBeGreaterThanOrEqual(25);
    expect(provider.flowCalls).toBeLessThanOrEqual(32);
    // The whole route still has a reading standing for it.
    expect(result.coverage).toBe(1);
  });

  it('keeps a box of incidents longer than a flow reading', async () => {
    const provider = new FakeProvider();
    const clock = clockAt('2026-10-10T09:00:00Z');
    const service = new TrafficService(provider, clock, options);
    await service.delayAlong(line);
    clock.set('2026-10-10T09:12:00Z'); // past the 5 minute flow time used in these tests, inside the 15 minute incident time
    await service.delayAlong(line);
    expect(provider.incidentCalls).toBe(1);
    clock.set('2026-10-10T09:16:00Z');
    await service.delayAlong(line);
    expect(provider.incidentCalls).toBe(2);
  });
});

describe('TrafficService when the provider refuses the account', () => {
  it('stops sending calls for a while after a refusal, and tries again after it', async () => {
    const provider = new FakeProvider();
    provider.refusing = true;
    const clock = clockAt('2026-10-10T09:00:00Z');
    const service = new TrafficService(provider, clock, options);
    await service.delayAlong(line);
    // The first refusal is learned from; the rest of that ask and the next asks send nothing.
    const afterFirst = provider.flowCalls + provider.incidentCalls;
    expect(afterFirst).toBeLessThanOrEqual(2);
    clock.set('2026-10-10T09:10:00Z');
    await service.delayAlong(line);
    expect(provider.flowCalls + provider.incidentCalls).toBe(afterFirst);
    // After the pause (30 minutes) it asks again, and once the account is fine again the readings come back.
    provider.refusing = false;
    clock.set('2026-10-10T09:31:00Z');
    const back = await service.delayAlong(line);
    expect(provider.flowCalls).toBeGreaterThan(afterFirst - 1);
    expect(back.coverage).toBe(1);
  });

  it('does not pause for an ordinary failure: an outage may pass in a moment', async () => {
    const provider = new FakeProvider();
    provider.failing = true;
    const service = new TrafficService(provider, clockAt('2026-10-10T09:00:00Z'), options);
    await service.delayAlong(line);
    expect(provider.flowCalls).toBeGreaterThan(2);
  });
});

describe('TrafficService problem reports', () => {
  it('says so, rarely, when the provider fails, so a broken key is not silent', async () => {
    const problems: string[] = [];
    const clock = clockAt('2026-10-10T09:00:00Z');
    const provider = new FakeProvider();
    provider.failing = true;
    const service = new TrafficService(provider, clock, {
      ...options,
      onProblem: (what) => problems.push(what),
    });

    await service.delayAlong(line);
    // Many failing calls in one go (a flow sample each, and the incidents) say it once for each kind.
    expect(problems.sort()).toEqual(['flow', 'incidents']);

    problems.length = 0;
    clock.set('2026-10-10T09:02:00Z');
    await service.delayAlong(line);
    expect(problems).toEqual([]);

    clock.set('2026-10-10T09:06:00Z');
    await service.delayAlong(line);
    expect(problems.sort()).toEqual(['flow', 'incidents']);
  });

  it('says so when the day allowance runs out', async () => {
    const problems: string[] = [];
    const service = new TrafficService(new FakeProvider(), clockAt('2026-10-10T09:00:00Z'), {
      ...options,
      dailyRequestLimit: 2,
      onProblem: (what) => problems.push(what),
    });
    await service.delayAlong(line);
    expect(problems).toEqual(['limit']);
  });

  it('says nothing when all is well', async () => {
    const problems: string[] = [];
    const service = new TrafficService(new FakeProvider(), clockAt('2026-10-10T09:00:00Z'), {
      ...options,
      onProblem: (what) => problems.push(what),
    });
    await service.delayAlong(line);
    expect(problems).toEqual([]);
  });
});

describe('TrafficService stretches', () => {
  // 11 points 2.2 km apart, sampled every 5 km: samples at points 0, 3, 6 and 9 (about 6.7 km each, the last 4.4 km).
  const slowProvider = (reading: FlowReading) => new FakeProvider(reading);

  it('marks the whole route when traffic is slow all along it, as one stretch from the start to the end', async () => {
    const service = new TrafficService(
      slowProvider({ currentSpeedKph: 40, freeFlowSpeedKph: 80, closed: false }),
      clockAt('2026-10-10T09:00:00Z'),
      options,
    );
    const { stretches } = await service.delayAlong(line);
    expect(stretches).toHaveLength(1);
    expect(stretches[0]).toMatchObject({ level: 'slow', fromM: 0 });
    expect(stretches[0]!.toM).toBeGreaterThan(22_000);
  });

  it('says heavy for near standstill or a closed road', async () => {
    const crawling = new TrafficService(
      slowProvider({ currentSpeedKph: 10, freeFlowSpeedKph: 80, closed: false }),
      clockAt('2026-10-10T09:00:00Z'),
      options,
    );
    expect((await crawling.delayAlong(line)).stretches[0]?.level).toBe('heavy');
    const closed = new TrafficService(
      slowProvider({ currentSpeedKph: 0, freeFlowSpeedKph: 80, closed: true }),
      clockAt('2026-10-10T09:00:00Z'),
      options,
    );
    expect((await closed.delayAlong(line)).stretches[0]?.level).toBe('heavy');
  });

  it('marks nothing when traffic is moving about as it should', async () => {
    const service = new TrafficService(
      slowProvider({ currentSpeedKph: 70, freeFlowSpeedKph: 80, closed: false }),
      clockAt('2026-10-10T09:00:00Z'),
      options,
    );
    expect((await service.delayAlong(line)).stretches).toEqual([]);
  });
});
