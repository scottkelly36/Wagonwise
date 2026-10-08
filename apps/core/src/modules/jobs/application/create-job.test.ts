import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { JobStop } from '../domain/job.js';
import { createJob, type CreateJobDeps } from './create-job.js';
import type { Caller } from './ports/caller-directory.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const companyId = makeId<'CompanyId'>('company-1');
const ADMIN: Caller = { kind: 'platform' };

function stops(): JobStop[] {
  return [
    { kind: 'pickup', name: 'Hexham depot', location: { lat: 54.97, lon: -2.1 } },
    { kind: 'delivery', name: 'Newcastle port', location: { lat: 54.97, lon: -1.6 } },
  ];
}

function buildDeps(repo: InMemoryJobRepository, clock = new FakeClock()): CreateJobDeps {
  return { repo, ids: new SequentialIdGenerator(), clock };
}

describe('createJob', () => {
  it('creates a draft job with a timeline entry stamped by the clock', async () => {
    const repo = new InMemoryJobRepository();
    const clock = new FakeClock('2026-10-01T09:00:00.000Z');
    const result = await createJob(buildDeps(repo, clock), {
      caller: ADMIN,
      companyId,
      reference: '  JOB-1  ',
      stops: stops(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      companyId,
      reference: 'JOB-1',
      stops: stops(),
      status: 'draft',
      timeline: [{ status: 'draft', at: new Date('2026-10-01T09:00:00.000Z') }],
      requiresProofOfDelivery: false,
      hasProofOfDelivery: false,
      currentStop: 0,
      proofStops: [],
    });

    expect(await repo.findById(result.value.id)).toEqual(result.value);
  });

  it('carries plannedStart and dueBy through when given', async () => {
    const repo = new InMemoryJobRepository();
    const plannedStart = new Date('2026-10-02T08:00:00.000Z');
    const dueBy = new Date('2026-10-02T17:00:00.000Z');
    const result = await createJob(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      reference: 'JOB-2',
      stops: stops(),
      plannedStart,
      dueBy,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plannedStart).toEqual(plannedStart);
    expect(result.value.dueBy).toEqual(dueBy);
  });

  it('defaults requiresProofOfDelivery to false, but carries it through when given', async () => {
    const repo = new InMemoryJobRepository();
    const defaulted = await createJob(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      reference: 'JOB-4',
      stops: stops(),
    });
    expect(defaulted.ok && defaulted.value.requiresProofOfDelivery).toBe(false);

    const required = await createJob(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      reference: 'JOB-5',
      stops: stops(),
      requiresProofOfDelivery: true,
    });
    expect(required.ok && required.value.requiresProofOfDelivery).toBe(true);
    expect(required.ok && required.value.hasProofOfDelivery).toBe(false);
  });

  it('rejects a blank reference without touching the repository', async () => {
    const repo = new InMemoryJobRepository();
    const result = await createJob(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      reference: '   ',
      stops: stops(),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidReference' } });
  });

  it('allows a job with a delivery and no pickup', async () => {
    const repo = new InMemoryJobRepository();
    const result = await createJob(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      reference: 'JOB-3',
      stops: [stops()[1]!],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects stops with no delivery', async () => {
    const repo = new InMemoryJobRepository();
    const result = await createJob(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      reference: 'JOB-4',
      stops: [stops()[0]!],
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidStops', reason: 'no_delivery' } });
  });

  it('rejects empty stops', async () => {
    const repo = new InMemoryJobRepository();
    const result = await createJob(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      reference: 'JOB-5',
      stops: [],
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidStops', reason: 'empty' } });
  });

  it('lets a dispatch member create for their own company, and refuses anyone else', async () => {
    const repo = new InMemoryJobRepository();
    const input = { companyId, reference: 'JOB-6', stops: stops() };
    const member: Caller = { kind: 'fleet', companyId, privileges: ['dispatch'] };
    const viewer: Caller = { kind: 'fleet', companyId, privileges: [] };
    const outsider: Caller = {
      kind: 'fleet',
      companyId: makeId<'CompanyId'>('company-2'),
      privileges: ['dispatch'],
    };

    expect((await createJob(buildDeps(repo), { ...input, caller: member })).ok).toBe(true);
    for (const caller of [viewer, outsider]) {
      expect(await createJob(buildDeps(repo), { ...input, caller })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });
});
