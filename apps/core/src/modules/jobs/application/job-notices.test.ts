import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Job } from '../domain/job.js';
import { assignJob } from './assign-job.js';
import {
  assignmentMessage,
  listNotices,
  noteSeen,
  resendNotice,
  sendAssignmentNotice,
} from './job-notices.js';
import type { Caller } from './ports/caller-directory.js';
import {
  InMemoryDriverDirectory,
  InMemoryVehicleDirectory,
} from './testing/in-memory-directories.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';
import { FakeDriverNotifier, InMemoryNoticeRepository } from './testing/in-memory-notices.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const jobId = makeId<'JobId'>('55555555-5555-4555-8555-555555555555');
const driverId = makeId<'DriverId'>('77777777-7777-4777-8777-777777777777');
const vehicleId = makeId<'FleetVehicleId'>('88888888-8888-4888-8888-888888888888');

const dispatcher: Caller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const viewer: Caller = { kind: 'fleet', companyId: acme, privileges: [] };
const outsider: Caller = { kind: 'fleet', companyId: beta, privileges: ['dispatch'] };

const draft: Job = {
  id: jobId,
  companyId: acme,
  reference: 'JOB-1',
  status: 'draft',
  timeline: [{ status: 'draft', at: new Date('2026-10-09T08:00:00.000Z') }],
  requiresProofOfDelivery: false,
  hasProofOfDelivery: false,
  currentStop: 0,
  proofStops: [],
  stops: [
    { kind: 'pickup', name: 'Hexham depot', location: { lat: 54.97, lon: -2.1 } },
    { kind: 'delivery', name: 'Newcastle port', location: { lat: 54.97, lon: -1.6 } },
  ],
};

async function setup() {
  const repo = new InMemoryJobRepository();
  await repo.save(draft);
  const notices = new InMemoryNoticeRepository();
  notices.seed(jobId, acme, driverId);
  const notifier = new FakeDriverNotifier();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps = { notifier, notices, clock };
  return { repo, notices, notifier, clock, deps };
}

describe('assigning a job tells the driver', () => {
  async function assign(s: Awaited<ReturnType<typeof setup>>) {
    return assignJob(
      {
        repo: s.repo,
        drivers: new InMemoryDriverDirectory(new Map([[driverId, acme]])),
        vehicles: new InMemoryVehicleDirectory(new Map([[vehicleId, acme]])),
        ids: new SequentialIdGenerator(),
        clock: s.clock,
        announce: async (job) => {
          await sendAssignmentNotice(s.deps, job);
        },
      },
      { caller: dispatcher, jobId, driverId, vehicleId },
    );
  }

  it('pushes the reference and the first stop to the driver, and notes it was sent', async () => {
    const s = await setup();
    expect((await assign(s)).ok).toBe(true);
    expect(s.notifier.sent).toHaveLength(1);
    expect(s.notifier.sent[0]?.driverId).toBe(driverId);
    expect(s.notifier.sent[0]?.message).toEqual({
      title: 'New job assigned',
      body: 'JOB-1: Hexham depot',
      data: { type: 'job_assigned', jobId },
    });
    expect(await s.notices.find(jobId)).toMatchObject({ result: 'sent', devices: 1, attempts: 1 });
  });

  it('notes that the driver has no phone registered', async () => {
    const s = await setup();
    s.notifier.report = { devices: 0, accepted: 0 };
    await assign(s);
    expect(await s.notices.find(jobId)).toMatchObject({ result: 'no_device', devices: 0 });
  });

  it('notes a refusal by the push service, and a service that is down, without failing the assignment', async () => {
    const refused = await setup();
    refused.notifier.report = { devices: 2, accepted: 0 };
    expect((await assign(refused)).ok).toBe(true);
    expect(await refused.notices.find(jobId)).toMatchObject({ result: 'failed', devices: 2 });

    const down = await setup();
    down.notifier.throws = true;
    expect((await assign(down)).ok).toBe(true);
    expect(await down.notices.find(jobId)).toMatchObject({ result: 'failed', attempts: 1 });
  });

  it('says sent when at least one of the phones took it', async () => {
    const s = await setup();
    s.notifier.report = { devices: 2, accepted: 1 };
    await assign(s);
    expect(await s.notices.find(jobId)).toMatchObject({ result: 'sent', devices: 2 });
  });
});

describe('resendNotice', () => {
  const assigned: Job = { ...draft, status: 'assigned', driverId, vehicleId };

  it('sends again and counts the attempt, for a dispatcher', async () => {
    const s = await setup();
    await s.repo.save(assigned);
    s.notifier.report = { devices: 0, accepted: 0 };
    await sendAssignmentNotice(s.deps, assigned);
    s.notifier.report = { devices: 1, accepted: 1 };
    const again = await resendNotice({ ...s.deps, repo: s.repo }, dispatcher, jobId);
    expect(again.ok && again.value).toMatchObject({ result: 'sent', attempts: 2, devices: 1 });
  });

  it('is for dispatchers only, hides another company’s job, and refuses a job no longer waiting', async () => {
    const s = await setup();
    await s.repo.save(assigned);
    const deps = { ...s.deps, repo: s.repo };
    expect(await resendNotice(deps, viewer, jobId)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await resendNotice(deps, outsider, jobId)).toEqual({
      ok: false,
      error: { tag: 'JobNotFound' },
    });
    await s.repo.save({ ...assigned, status: 'accepted' });
    expect(await resendNotice(deps, dispatcher, jobId)).toEqual({
      ok: false,
      error: { tag: 'NothingToSend' },
    });
    await s.repo.save(draft);
    expect(await resendNotice(deps, dispatcher, jobId)).toEqual({
      ok: false,
      error: { tag: 'NothingToSend' },
    });
  });
});

describe('listNotices and noteSeen', () => {
  it('lists the company’s notices to anyone in it, and to nobody else', async () => {
    const s = await setup();
    const own = await listNotices(s.deps, viewer, acme);
    expect(own.ok && own.value).toHaveLength(1);
    expect(await listNotices(s.deps, outsider, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('notes the first time the driver opens a job waiting for them, and only then', async () => {
    const s = await setup();
    const assigned: Job = { ...draft, status: 'assigned', driverId, vehicleId };
    await noteSeen(s.deps, assigned);
    const first = (await s.notices.find(jobId))?.seenAt;
    expect(first).not.toBeNull();
    s.clock.set('2026-10-09T12:00:00.000Z');
    await noteSeen(s.deps, assigned);
    expect((await s.notices.find(jobId))?.seenAt).toEqual(first);
  });

  it('does not note a job already accepted', async () => {
    const s = await setup();
    await noteSeen(s.deps, { ...draft, status: 'accepted', driverId, vehicleId });
    expect((await s.notices.find(jobId))?.seenAt).toBeNull();
  });
});

describe('assignmentMessage', () => {
  it('falls back to the reference when there are no stops to name', () => {
    expect(assignmentMessage({ ...draft, stops: [] }).body).toBe('JOB-1');
  });
});
