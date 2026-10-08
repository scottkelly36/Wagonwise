import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { err } from '../../../shared/result.js';
import type { Job } from '../domain/job.js';
import type { Caller } from './ports/caller-directory.js';
import { listJobEtas } from './list-job-etas.js';
import { FakeJobRouteEstimator } from './testing/fake-job-route-estimator.js';
import { InMemoryJobPositionRepository } from './testing/in-memory-job-position-repository.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const company = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const otherCompany = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const vehicle = makeId<'FleetVehicleId'>('vehicle-1');
const viewer: Caller = { kind: 'fleet', companyId: company, privileges: [] };
const outsider: Caller = { kind: 'fleet', companyId: otherCompany, privileges: [] };
const pickup = { kind: 'pickup' as const, name: 'Depot', location: { lat: 54.9, lon: -2.1 } };
const delivery = { kind: 'delivery' as const, name: 'Port', location: { lat: 55.0, lon: -1.6 } };

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id: makeId<'JobId'>(id),
    companyId: company,
    reference: id,
    status: 'en_route',
    vehicleId: vehicle,
    stops: [pickup, delivery],
    timeline: [],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
    currentStop: 0,
    proofStops: [],
    ...overrides,
  };
}

async function setup(jobs: Job[], positioned: string[] = jobs.map((j) => j.id)) {
  const repo = new InMemoryJobRepository();
  for (const j of jobs) await repo.save(j);
  const positions = new InMemoryJobPositionRepository(repo);
  for (const id of positioned) {
    await positions.record({
      jobId: makeId<'JobId'>(id),
      location: { lat: 54.95, lon: -2.0 },
      recordedAt: new Date('2026-10-03T10:00:00.000Z'),
    });
  }
  const routes = new FakeJobRouteEstimator();
  return { deps: { repo, positions, routes }, routes };
}

describe('listJobEtas', () => {
  it('routes from the last position to the delivery once the load is on, and says how old that start is', async () => {
    const { deps, routes } = await setup([job('j1', { currentStop: 1 })]);

    const result = await listJobEtas(deps, { caller: viewer, companyId: company });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          jobId: 'j1',
          stopKind: 'delivery',
          distanceKm: 40,
          durationMin: 50,
          geometry: 'fake-line',
          fromRecordedAt: new Date('2026-10-03T10:00:00.000Z'),
        },
      ],
    });
    expect(routes.requests).toEqual([
      { vehicleId: vehicle, from: { lat: 54.95, lon: -2.0 }, to: delivery.location },
    ]);
  });

  it('heads for the pickup until the load is on', async () => {
    const { deps, routes } = await setup([job('j1', { status: 'accepted' })]);
    await listJobEtas(deps, { caller: viewer, companyId: company });
    expect(routes.requests[0]?.to).toEqual(pickup.location);
  });

  it('leaves out jobs that are not on the road, have no vehicle, or have not been heard from', async () => {
    const { deps, routes } = await setup(
      [
        job('assigned', { status: 'assigned' }),
        job('no-vehicle', { vehicleId: undefined }),
        job('silent'),
        job('ok'),
      ],
      ['assigned', 'no-vehicle', 'ok'],
    );

    const result = await listJobEtas(deps, { caller: viewer, companyId: company });

    expect(result.ok && result.value.map((e) => e.jobId)).toEqual(['ok']);
    expect(routes.requests).toHaveLength(1);
  });

  it('leaves out a job with no route for its vehicle, and still answers for the others', async () => {
    const { deps, routes } = await setup([job('j1')]);
    routes.result = err({ tag: 'RouteUnavailable' });
    expect(await listJobEtas(deps, { caller: viewer, companyId: company })).toEqual({
      ok: true,
      value: [],
    });
  });

  it('degrades to no ETAs, rather than failing, when the routing engine is down', async () => {
    const { deps, routes } = await setup([job('j1')]);
    routes.fault = new Error('valhalla down');
    expect(await listJobEtas(deps, { caller: viewer, companyId: company })).toEqual({
      ok: true,
      value: [],
    });
  });

  it('is forbidden to staff from another company', async () => {
    const { deps } = await setup([job('j1')]);
    expect(await listJobEtas(deps, { caller: outsider, companyId: company })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});
