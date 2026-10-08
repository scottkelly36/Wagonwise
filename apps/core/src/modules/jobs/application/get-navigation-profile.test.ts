import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Job } from '../domain/job.js';
import { getNavigationProfile } from './get-navigation-profile.js';
import { FakeNavigationProfileProvisioner } from './testing/fake-navigation-profile-provisioner.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const DRIVER = makeId<'DriverId'>('driver-1');
const OTHER = makeId<'DriverId'>('driver-2');
const COMPANY = makeId<'CompanyId'>('company-1');
const VEHICLE = makeId<'FleetVehicleId'>('vehicle-1');
const JOB_ID = makeId<'JobId'>('job-1');

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: JOB_ID,
    companyId: COMPANY,
    reference: 'JOB-1',
    stops: [],
    status: 'accepted',
    driverId: DRIVER,
    vehicleId: VEHICLE,
    timeline: [],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
    currentStop: 0,
    proofStops: [],
    ...overrides,
  };
}

async function setup(overrides: Partial<Job> = {}, missing: string[] = []) {
  const repo = new InMemoryJobRepository();
  await repo.save(job(overrides));
  const profiles = new FakeNavigationProfileProvisioner(new Set(missing));
  return { deps: { repo, profiles }, profiles };
}

const asDriver = { kind: 'driver', driverId: DRIVER } as const;

describe('getNavigationProfile', () => {
  it('gives the job’s driver a profile built from the vehicle the job is assigned', async () => {
    const { deps, profiles } = await setup();

    const result = await getNavigationProfile(deps, { actor: asDriver, jobId: JOB_ID });

    expect(result).toMatchObject({ ok: true, value: { vehicleName: 'Scania R450' } });
    expect(profiles.asked).toEqual([{ driverId: DRIVER, vehicleId: VEHICLE }]);
  });

  it('works at every step of a job that is being driven', async () => {
    for (const status of ['accepted', 'at_pickup', 'loaded', 'en_route', 'at_delivery'] as const) {
      const { deps } = await setup({ status });
      const result = await getNavigationProfile(deps, { actor: asDriver, jobId: JOB_ID });
      expect(result.ok, status).toBe(true);
    }
  });

  it('refuses a job that is not being driven, and builds no profile', async () => {
    for (const status of ['assigned', 'delivered', 'cancelled', 'failed'] as const) {
      const { deps, profiles } = await setup({ status });
      const result = await getNavigationProfile(deps, { actor: asDriver, jobId: JOB_ID });
      expect(result, status).toMatchObject({ ok: false, error: { tag: 'NotTracking' } });
      expect(profiles.asked).toEqual([]);
    }
  });

  it('refuses a job with no vehicle, rather than guessing one', async () => {
    const { deps, profiles } = await setup({ vehicleId: undefined });

    const result = await getNavigationProfile(deps, { actor: asDriver, jobId: JOB_ID });

    expect(result).toMatchObject({ ok: false, error: { tag: 'NoVehicleAssigned' } });
    expect(profiles.asked).toEqual([]);
  });

  it('is not found for a driver who is not on the job, and for an unknown job', async () => {
    const { deps } = await setup();
    const other = await getNavigationProfile(deps, {
      actor: { kind: 'driver', driverId: OTHER },
      jobId: JOB_ID,
    });
    const unknown = await getNavigationProfile(deps, {
      actor: asDriver,
      jobId: makeId<'JobId'>('nope'),
    });
    expect(other).toMatchObject({ ok: false, error: { tag: 'JobNotFound' } });
    expect(unknown).toMatchObject({ ok: false, error: { tag: 'JobNotFound' } });
  });

  it('passes on that the vehicle can no longer be used', async () => {
    const { deps } = await setup({}, [VEHICLE]);
    const result = await getNavigationProfile(deps, { actor: asDriver, jobId: JOB_ID });
    expect(result).toMatchObject({ ok: false, error: { tag: 'VehicleUnavailable' } });
  });
});
