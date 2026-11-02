import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { ClosureCandidate } from '../domain/closure-on-route.js';
import type { GeoPoint } from '../domain/geo.js';
import type { ReportedObstruction } from '../domain/reported-obstruction.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { planRoute, type PlanRouteDeps } from './plan-route.js';
import { encodePolyline } from './testing/encode-polyline.js';
import { FakeClosureAvoidanceQuery } from './testing/fake-closure-avoidance-query.js';
import { FakeHazardAvoidanceQuery } from './testing/fake-hazard-avoidance-query.js';
import { FakeHazardsOnRouteQuery } from './testing/fake-hazards-on-route-query.js';
import { FakeRestrictionOverrideRepository } from './testing/fake-restriction-override-repository.js';
import { FakeRoutingEngine } from './testing/fake-routing-engine.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';

const driverId = makeId<'DriverId'>('driver-1');
const profileId = makeId<'VehicleProfileId'>('profile-1');
const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const origin = { lat: 54.9, lon: -2.3 };
const destination = { lat: 54.95, lon: -2.3 };
const now = new Date('2026-11-02T20:00:00.000Z');

/** A straight line of points every 0.001 degrees of latitude (about 111 m), going north if `from` < `to`. */
function line(from: number, to: number, lon = -2.3): GeoPoint[] {
  const step = from <= to ? 0.001 : -0.001;
  const n = Math.round(Math.abs(to - from) / 0.001);
  return Array.from({ length: n + 1 }, (_, i) => ({ lat: +(from + step * i).toFixed(6), lon }));
}

/** The planned route: 5.5 km north, 20 minutes. */
const planned = { geometry: encodePolyline(line(54.9, 54.955)), distanceKm: 5.5, durationMin: 20 };
const roundAbout = {
  geometry: encodePolyline(line(54.9, 54.955, -2.31)),
  distanceKm: 7,
  durationMin: 25,
};
const found = (r: typeof planned) => ({ ok: true as const, value: { ...r, maneuvers: [] } });

function closure(
  overrides: Partial<ClosureCandidate> = {},
  along = line(54.92, 54.93),
): ClosureCandidate {
  return {
    id: 'c1',
    kind: 'full',
    description: 'A1 northbound between J1 and J2, carriageway closure',
    startsAt: new Date('2026-11-02T19:00:00.000Z'),
    endsAt: new Date('2026-11-03T06:00:00.000Z'),
    position: along[0]!,
    lines: [along],
    ...overrides,
  };
}

async function buildDeps() {
  const vehicleProfileRepo = new InMemoryVehicleProfileRepository();
  await vehicleProfileRepo.save({ id: profileId, driverId, name: 'Big Wagon', dimensions });
  const deps: PlanRouteDeps = {
    vehicleProfileRepo,
    routePlanRepo: new InMemoryRoutePlanRepository(),
    routingEngine: new FakeRoutingEngine(),
    hazardAvoidanceQuery: new FakeHazardAvoidanceQuery(),
    hazardsOnRouteQuery: new FakeHazardsOnRouteQuery(),
    closureAvoidanceQuery: new FakeClosureAvoidanceQuery(),
    restrictionOverrideRepo: new FakeRestrictionOverrideRepository(),
    clock: new FakeClock(now),
    ids: new SequentialIdGenerator(),
    fuelPricePerLitreGBP: 1.6,
  };
  return {
    deps,
    engine: deps.routingEngine as FakeRoutingEngine,
    closures: deps.closureAvoidanceQuery as FakeClosureAvoidanceQuery,
    hazards: deps.hazardAvoidanceQuery as FakeHazardAvoidanceQuery,
  };
}

const plan = (deps: PlanRouteDeps) => planRoute(deps, { driverId, profileId, origin, destination });

describe('planRoute and road closures', () => {
  it('asks about closures along the route it planned, as far ahead as the drive can reach', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned)];

    const result = await plan(deps);

    expect(result.ok).toBe(true);
    expect(closures.asked).toEqual([{ route: planned.geometry, withinHours: 1 }]);
    expect(engine.requests).toHaveLength(1);
  });

  it('plans again round a closure the route goes through that is shut when the driver gets there', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned), found(roundAbout)];
    closures.answers = [[closure()], []];

    const result = await plan(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.geometry).toBe(roundAbout.geometry);
    expect(engine.requests).toHaveLength(2);
    expect(engine.requests[0]?.avoid).toEqual([]);
    const zones = engine.requests[1]!.avoid;
    expect(zones.length).toBeGreaterThanOrEqual(1);
    // thin boxes on the road itself (lon -2.3), not a box around the whole closure
    for (const zone of zones) {
      const lons = zone.points.map((p) => p.lon);
      expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(0.0001);
      expect(Math.min(...zone.points.map((p) => p.lat))).toBeGreaterThan(54.9195);
      expect(Math.max(...zone.points.map((p) => p.lat))).toBeLessThan(54.9305);
    }
  });

  it('tells the driver which closure it went round', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned), found(roundAbout)];
    closures.answers = [[closure()], []];

    const result = await plan(deps);

    expect(result.ok && result.value.avoidedRestrictions).toEqual([
      { description: 'Road closure avoided: A1 northbound between J1 and J2, carriageway closure' },
    ]);
  });

  it('asks about closures again along the new route', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned), found(roundAbout)];
    closures.answers = [[closure()], []];

    await plan(deps);

    expect(closures.asked.map((a) => a.route)).toEqual([planned.geometry, roundAbout.geometry]);
  });

  it('keeps the route when there is no way round, and does not say it went round', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned), { ok: false, error: { tag: 'NoRouteFound' } }];
    closures.answers = [[closure()]];

    const result = await plan(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.geometry).toBe(planned.geometry);
    expect(result.value.avoidedRestrictions).toEqual([]);
  });

  it('does not say it went round a closure the new route still runs along', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned), found(planned)];
    closures.answers = [[closure()], [closure()]];

    const result = await plan(deps);

    expect(result.ok && result.value.avoidedRestrictions).toEqual([]);
    expect(engine.requests).toHaveLength(2);
  });

  it('goes round a second closure that the way round leads through, keeping the first avoided', async () => {
    const { deps, engine, closures } = await buildDeps();
    const second = closure({ id: 'c2', description: 'second' }, line(54.94, 54.95, -2.31));
    engine.results = [found(planned), found(roundAbout), found(planned)];
    closures.answers = [[closure()], [second], []];

    const result = await plan(deps);

    expect(engine.requests).toHaveLength(3);
    expect(engine.requests[2]!.avoid.length).toBeGreaterThan(engine.requests[1]!.avoid.length);
    expect(engine.requests[2]!.avoid).toEqual(
      expect.arrayContaining(engine.requests[1]!.avoid.map((z) => z)),
    );
    expect(result.ok && result.value.avoidedRestrictions.map((r) => r.description)).toEqual([
      'Road closure avoided: A1 northbound between J1 and J2, carriageway closure',
      'Road closure avoided: second',
    ]);
  });

  it('plans again no more than twice, however many closures lie in the way', async () => {
    const { deps, engine, closures } = await buildDeps();
    const other = (id: string) => closure({ id, description: id }, line(54.92, 54.93, -2.31));
    engine.results = [found(planned), found(roundAbout), found(roundAbout), found(roundAbout)];
    closures.answers = [[closure()], [other('c2')], [other('c3')], [other('c4')]];

    const result = await plan(deps);

    expect(result.ok).toBe(true);
    expect(engine.requests).toHaveLength(3);
  });

  it('puts a blocking hazard’s area in every request, along with the closure’s', async () => {
    const { deps, engine, closures, hazards } = await buildDeps();
    const hazard: ReportedObstruction = {
      id: 'hazard-1',
      kind: 'height',
      limit: 3.5,
      zone: { points: [{ lat: 54.91, lon: -2.3 }] },
    };
    hazards.obstructions = [hazard];
    engine.results = [found(planned), found(planned), found(roundAbout)];
    closures.answers = [[closure()], []];

    const result = await plan(deps);

    expect(engine.requests).toHaveLength(3);
    expect(engine.requests[1]?.avoid).toEqual([hazard.zone]);
    expect(engine.requests[2]?.avoid[0]).toEqual(hazard.zone);
    expect(engine.requests[2]!.avoid.length).toBeGreaterThan(1);
    expect(result.ok && result.value.geometry).toBe(roundAbout.geometry);
  });

  it('leaves a lane closure alone: the road is open', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned)];
    closures.candidates = [closure({ kind: 'lane' })];

    await plan(deps);

    expect(engine.requests).toHaveLength(1);
  });

  it('leaves alone a closure on the other carriageway', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned)];
    closures.candidates = [closure({}, line(54.93, 54.92, -2.2996))];

    await plan(deps);

    expect(engine.requests).toHaveLength(1);
  });

  it('leaves alone a closure that is over before the driver gets there', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned)];
    closures.candidates = [closure({ endsAt: new Date('2026-11-02T19:30:00.000Z') })];

    await plan(deps);

    expect(engine.requests).toHaveLength(1);
  });

  it('leaves alone a closure that does not start until long after the driver has passed', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned)];
    closures.candidates = [closure({ startsAt: new Date('2026-11-02T23:00:00.000Z') })];

    await plan(deps);

    expect(engine.requests).toHaveLength(1);
  });

  it('leaves a scheme that runs for days to the warning on the route screen: the road may be open', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.results = [found(planned)];
    closures.candidates = [closure({ endsAt: new Date('2026-11-09T06:00:00.000Z') })];

    await plan(deps);

    expect(engine.requests).toHaveLength(1);
  });

  it('goes round a closure when the driver asked for the shortest way', async () => {
    const { deps, engine, closures } = await buildDeps();
    engine.alternativesResult = { ok: true, value: [found(planned).value] };
    engine.results = [found(roundAbout)];
    closures.answers = [[closure()], []];

    const result = await planRoute(deps, {
      driverId,
      profileId,
      origin,
      destination,
      strategy: 'shortest',
    });

    expect(result.ok && result.value.geometry).toBe(roundAbout.geometry);
    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0]!.avoid.length).toBeGreaterThanOrEqual(1);
  });
});
