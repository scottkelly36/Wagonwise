import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Job } from '../domain/job.js';
import { assignJob, type AssignJobDeps } from './assign-job.js';
import type { Caller } from './ports/caller-directory.js';
import {
  InMemoryDriverDirectory,
  InMemoryVehicleDirectory,
} from './testing/in-memory-directories.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const company = makeId<'CompanyId'>('company-1');
const otherCompany = makeId<'CompanyId'>('company-2');
const driver = makeId<'DriverId'>('driver-1');
const driver2 = makeId<'DriverId'>('driver-2');
const vehicle = makeId<'FleetVehicleId'>('vehicle-1');
const ADMIN: Caller = { kind: 'platform' };

function draft(id = 'job-1'): Job {
  return {
    id: makeId<'JobId'>(id),
    companyId: company,
    reference: id,
    stops: [],
    status: 'draft',
    timeline: [{ status: 'draft', at: new Date('2026-10-01T09:00:00.000Z') }],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
  };
}

function setup() {
  const repo = new InMemoryJobRepository();
  const deps: AssignJobDeps = {
    repo,
    drivers: new InMemoryDriverDirectory(
      new Map([
        [driver, company],
        [driver2, company],
        [makeId<'DriverId'>('stranger'), otherCompany],
      ]),
    ),
    vehicles: new InMemoryVehicleDirectory(
      new Map([
        [vehicle, company],
        [makeId<'FleetVehicleId'>('their-van'), otherCompany],
      ]),
    ),
    ids: new SequentialIdGenerator(),
    clock: new FakeClock('2026-10-01T10:00:00.000Z'),
  };
  return { repo, deps };
}

describe('assignJob', () => {
  it('assigns a draft, stamping the time and raising JobAssigned and JobStatusChanged', async () => {
    const { repo, deps } = setup();
    await repo.save(draft());
    const r = await assignJob(deps, {
      caller: ADMIN,
      jobId: makeId<'JobId'>('job-1'),
      driverId: driver,
      vehicleId: vehicle,
    });
    expect(r.ok && r.value).toMatchObject({
      status: 'assigned',
      driverId: driver,
      vehicleId: vehicle,
    });
    expect(repo.events.map((e) => e.eventType)).toEqual(['JobAssigned', 'JobStatusChanged']);
    expect(await repo.findById(makeId<'JobId'>('job-1'))).toMatchObject({ status: 'assigned' });
  });

  it('refuses a driver or vehicle from another company', async () => {
    const { repo, deps } = setup();
    await repo.save(draft());
    const base = { caller: ADMIN, jobId: makeId<'JobId'>('job-1') };
    expect(
      await assignJob(deps, {
        ...base,
        driverId: makeId<'DriverId'>('stranger'),
        vehicleId: vehicle,
      }),
    ).toEqual({ ok: false, error: { tag: 'DriverNotInCompany' } });
    expect(
      await assignJob(deps, {
        ...base,
        driverId: driver,
        vehicleId: makeId<'FleetVehicleId'>('their-van'),
      }),
    ).toEqual({ ok: false, error: { tag: 'VehicleNotInCompany' } });
    expect(repo.events).toEqual([]);
  });

  it('refuses a driver who is already on an active job', async () => {
    const { repo, deps } = setup();
    await repo.save({ ...draft('busy'), status: 'en_route', driverId: driver });
    await repo.save(draft('job-2'));
    const r = await assignJob(deps, {
      caller: ADMIN,
      jobId: makeId<'JobId'>('job-2'),
      driverId: driver,
      vehicleId: vehicle,
    });
    expect(r).toEqual({ ok: false, error: { tag: 'DriverBusy' } });
  });

  it('lets a driver whose last job is finished take another', async () => {
    const { repo, deps } = setup();
    await repo.save({ ...draft('done'), status: 'delivered', driverId: driver });
    await repo.save(draft('job-2'));
    const r = await assignJob(deps, {
      caller: ADMIN,
      jobId: makeId<'JobId'>('job-2'),
      driverId: driver,
      vehicleId: vehicle,
    });
    expect(r.ok).toBe(true);
  });

  it('refuses a job that is not a draft', async () => {
    const { repo, deps } = setup();
    await repo.save({ ...draft(), status: 'cancelled' });
    const r = await assignJob(deps, {
      caller: ADMIN,
      jobId: makeId<'JobId'>('job-1'),
      driverId: driver,
      vehicleId: vehicle,
    });
    expect(r).toEqual({
      ok: false,
      error: { tag: 'InvalidTransition', from: 'cancelled', to: 'assigned' },
    });
  });

  it('is Forbidden without dispatch, and NotFound for another company or an unknown id', async () => {
    const { repo, deps } = setup();
    await repo.save(draft());
    const input = {
      jobId: makeId<'JobId'>('job-1'),
      driverId: driver,
      vehicleId: vehicle,
    };
    const viewer: Caller = { kind: 'fleet', companyId: company, privileges: [] };
    const outsider: Caller = { kind: 'fleet', companyId: otherCompany, privileges: ['dispatch'] };
    expect(await assignJob(deps, { ...input, caller: viewer })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await assignJob(deps, { ...input, caller: outsider })).toEqual({
      ok: false,
      error: { tag: 'JobNotFound' },
    });
    expect(
      await assignJob(deps, { ...input, caller: ADMIN, jobId: makeId<'JobId'>('nope') }),
    ).toEqual({ ok: false, error: { tag: 'JobNotFound' } });
  });
});
