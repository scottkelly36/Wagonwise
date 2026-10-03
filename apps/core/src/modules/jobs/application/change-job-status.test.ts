import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Job, JobStatus } from '../domain/job.js';
import type { JobActor } from './authorization.js';
import {
  advanceJobStatus,
  cancelJob,
  failJob,
  type ChangeJobStatusDeps,
} from './change-job-status.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const company = makeId<'CompanyId'>('company-1');
const driver = makeId<'DriverId'>('driver-1');
const jobId = makeId<'JobId'>('job-1');
const ADMIN: JobActor = { kind: 'platform' };
const DRIVER: JobActor = { kind: 'driver', driverId: driver };

async function setup(
  status: JobStatus,
  pod: { requiresProofOfDelivery?: boolean; hasProofOfDelivery?: boolean } = {},
) {
  const repo = new InMemoryJobRepository();
  const job: Job = {
    id: jobId,
    companyId: company,
    reference: 'JOB-1',
    stops: [],
    status,
    driverId: driver,
    timeline: [{ status: 'draft', at: new Date('2026-10-01T09:00:00.000Z') }],
    requiresProofOfDelivery: pod.requiresProofOfDelivery ?? false,
    hasProofOfDelivery: pod.hasProofOfDelivery ?? false,
  };
  await repo.save(job);
  const deps: ChangeJobStatusDeps = {
    repo,
    ids: new SequentialIdGenerator(),
    clock: new FakeClock('2026-10-01T11:00:00.000Z'),
  };
  return { repo, deps };
}

describe('advanceJobStatus', () => {
  it("lets the job's own driver step it on, stamping the position, and raises JobStatusChanged", async () => {
    const { repo, deps } = await setup('assigned');
    const r = await advanceJobStatus(deps, {
      actor: DRIVER,
      jobId,
      to: 'accepted',
      position: { lat: 54.9, lon: -2.1 },
    });
    expect(r.ok && r.value.timeline.at(-1)).toEqual({
      status: 'accepted',
      at: new Date('2026-10-01T11:00:00.000Z'),
      position: { lat: 54.9, lon: -2.1 },
    });
    expect(repo.events.map((e) => e.eventType)).toEqual(['JobStatusChanged']);
  });

  it('raises JobCompleted as well when the job is delivered', async () => {
    const { repo, deps } = await setup('at_delivery');
    await advanceJobStatus(deps, { actor: DRIVER, jobId, to: 'delivered' });
    expect(repo.events.map((e) => e.eventType)).toEqual(['JobStatusChanged', 'JobCompleted']);
  });

  it('refuses a skip, and a different driver sees the job as not found', async () => {
    const { deps } = await setup('assigned');
    expect(await advanceJobStatus(deps, { actor: DRIVER, jobId, to: 'loaded' })).toEqual({
      ok: false,
      error: { tag: 'InvalidTransition', from: 'assigned', to: 'loaded' },
    });
    const other: JobActor = { kind: 'driver', driverId: makeId<'DriverId'>('driver-2') };
    expect(await advanceJobStatus(deps, { actor: other, jobId, to: 'accepted' })).toEqual({
      ok: false,
      error: { tag: 'JobNotFound' },
    });
  });

  it('lets a dispatcher in the company step it, but not a viewer', async () => {
    const { deps } = await setup('assigned');
    const dispatcher: JobActor = { kind: 'fleet', companyId: company, privileges: ['dispatch'] };
    const viewer: JobActor = { kind: 'fleet', companyId: company, privileges: [] };
    expect(await advanceJobStatus(deps, { actor: viewer, jobId, to: 'accepted' })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await advanceJobStatus(deps, { actor: dispatcher, jobId, to: 'accepted' })).ok).toBe(
      true,
    );
  });

  it('refuses to reach delivered without proof when the job requires one', async () => {
    const { deps } = await setup('at_delivery', { requiresProofOfDelivery: true });
    expect(await advanceJobStatus(deps, { actor: DRIVER, jobId, to: 'delivered' })).toEqual({
      ok: false,
      error: { tag: 'ProofOfDeliveryRequired' },
    });
  });

  it('reaches delivered once proof is attached', async () => {
    const { deps } = await setup('at_delivery', {
      requiresProofOfDelivery: true,
      hasProofOfDelivery: true,
    });
    expect((await advanceJobStatus(deps, { actor: DRIVER, jobId, to: 'delivered' })).ok).toBe(true);
  });

  it("doesn't require proof when the job doesn't ask for it", async () => {
    const { deps } = await setup('at_delivery');
    expect((await advanceJobStatus(deps, { actor: DRIVER, jobId, to: 'delivered' })).ok).toBe(true);
  });
});

describe('cancelJob', () => {
  it('lets a dispatcher cancel an unfinished job, raising JobCancelled', async () => {
    const { repo, deps } = await setup('en_route');
    const r = await cancelJob(deps, { actor: ADMIN, jobId });
    expect(r.ok && r.value.status).toBe('cancelled');
    expect(repo.events.map((e) => e.eventType)).toEqual(['JobStatusChanged', 'JobCancelled']);
  });

  it("does not let a driver cancel, and can't cancel a finished job", async () => {
    const { deps } = await setup('en_route');
    expect(await cancelJob(deps, { actor: DRIVER, jobId })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    const done = await setup('delivered');
    expect((await cancelJob(done.deps, { actor: ADMIN, jobId })).ok).toBe(false);
  });
});

describe('failJob', () => {
  it('fails a job that is with a driver, and refuses a draft', async () => {
    const { deps } = await setup('loaded');
    const r = await failJob(deps, { actor: DRIVER, jobId, position: { lat: 55, lon: -2 } });
    expect(r.ok && r.value.status).toBe('failed');
    const draft = await setup('draft');
    expect(await failJob(draft.deps, { actor: ADMIN, jobId })).toEqual({
      ok: false,
      error: { tag: 'InvalidTransition', from: 'draft', to: 'failed' },
    });
  });
});
