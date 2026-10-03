import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { err } from '../../../shared/result.js';
import type { Job } from '../domain/job.js';
import type { Caller } from './ports/caller-directory.js';
import { previewJobRoute } from './preview-job-route.js';
import { InMemoryVehicleDirectory } from './testing/in-memory-directories.js';
import { FakeJobRouteEstimator } from './testing/fake-job-route-estimator.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const company = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const vehicle = makeId<'FleetVehicleId'>('vehicle-1');
const dispatcher: Caller = { kind: 'fleet', companyId: company, privileges: ['dispatch'] };
const stop = (kind: 'pickup' | 'delivery', name: string, lat: number) => ({
  kind,
  name,
  location: { lat, lon: -2 },
});

async function setup(stops: Job['stops']) {
  const repo = new InMemoryJobRepository();
  const job: Job = {
    id: makeId<'JobId'>('job-1'),
    companyId: company,
    reference: 'J1',
    status: 'draft',
    stops,
    timeline: [],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
  };
  await repo.save(job);
  const routes = new FakeJobRouteEstimator();
  const vehicles = new InMemoryVehicleDirectory(new Map([[vehicle, company]]));
  return { deps: { repo, vehicles, routes }, routes, job };
}

describe('previewJobRoute', () => {
  it('routes each leg in order and adds them up', async () => {
    const { deps, routes, job } = await setup([
      stop('pickup', 'A', 54.0),
      stop('pickup', 'B', 54.5),
      stop('delivery', 'C', 55.0),
    ]);

    const result = await previewJobRoute(deps, {
      caller: dispatcher,
      jobId: job.id,
      vehicleId: vehicle,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        legs: [
          { fromName: 'A', toName: 'B', distanceKm: 40, durationMin: 50 },
          { fromName: 'B', toName: 'C', distanceKm: 40, durationMin: 50 },
        ],
        distanceKm: 80,
        durationMin: 100,
      },
    });
    expect(routes.requests.map((r) => r.from.lat)).toEqual([54.0, 54.5]);
  });

  it('fails with NoRouteForVehicle if any leg cannot be driven by that vehicle', async () => {
    const { deps, routes, job } = await setup([
      stop('pickup', 'A', 54.0),
      stop('delivery', 'B', 55.0),
    ]);
    routes.result = err({ tag: 'RouteUnavailable' });
    expect(
      await previewJobRoute(deps, { caller: dispatcher, jobId: job.id, vehicleId: vehicle }),
    ).toEqual({ ok: false, error: { tag: 'NoRouteForVehicle' } });
  });

  it('is a plain zero-length preview for a job with a single stop', async () => {
    const { deps, job } = await setup([stop('pickup', 'A', 54.0)]);
    expect(
      await previewJobRoute(deps, { caller: dispatcher, jobId: job.id, vehicleId: vehicle }),
    ).toEqual({ ok: true, value: { legs: [], distanceKm: 0, durationMin: 0 } });
  });
});
