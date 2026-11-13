import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { Job } from '../domain/job.js';
import { DEFAULT_JOB_WINDOW_DAYS, JOB_LIST_LIMIT, listJobs } from './list-jobs.js';
import type { Caller } from './ports/caller-directory.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const company = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const viewer: Caller = { kind: 'fleet', companyId: company, privileges: ['dispatch'] };
const stranger: Caller = {
  kind: 'fleet',
  companyId: makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222'),
  privileges: ['dispatch'],
};
const DAY = 24 * 60 * 60 * 1000;

function job(id: string, daysAgo: number, now: Date, overrides: Partial<Job> = {}): Job {
  return {
    id: makeId<'JobId'>(id),
    companyId: company,
    reference: id,
    status: 'draft',
    stops: [
      { kind: 'pickup', name: 'Depot', location: { lat: 54.9, lon: -2.1 } },
      { kind: 'delivery', name: 'Port', location: { lat: 55.0, lon: -1.6 } },
    ],
    timeline: [{ status: 'draft', at: new Date(now.getTime() - daysAgo * DAY) }],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
    currentStop: 0,
    proofStops: [],
    requiresSignature: false,
    signatureStops: [],
    hasSignature: false,
    ...overrides,
  };
}

async function setup() {
  const clock = new FakeClock();
  const now = clock.now();
  const repo = new InMemoryJobRepository();
  for (const j of [
    job('recent-done', 5, now, { status: 'delivered' }),
    job('old-done', 200, now, { status: 'delivered' }),
    job('old-cancelled', 120, now, { status: 'cancelled' }),
    job('old-but-open', 300, now, { status: 'assigned' }),
    job('old-draft', 150, now),
  ]) {
    await repo.save(j);
  }
  return { deps: { repo, clock }, now };
}

const refs = (jobs: readonly Job[]) => jobs.map((j) => j.reference);

describe('listJobs', () => {
  it('lists open jobs of any age and finished jobs from the last 90 days, newest first', async () => {
    const { deps, now } = await setup();
    const result = await listJobs(deps, { caller: viewer, companyId: company });
    expect(result.ok && refs(result.value.jobs)).toEqual([
      'recent-done',
      'old-draft',
      'old-but-open',
    ]);
    expect(result.ok && result.value.since).toEqual(
      new Date(now.getTime() - DEFAULT_JOB_WINDOW_DAYS * DAY),
    );
  });

  it('takes a window of its own', async () => {
    const { deps } = await setup();
    const result = await listJobs(deps, { caller: viewer, companyId: company, days: 150 });
    expect(result.ok && refs(result.value.jobs)).toEqual([
      'recent-done',
      'old-cancelled',
      'old-draft',
      'old-but-open',
    ]);
  });

  it('lists everything on request, and then says no window applied', async () => {
    const { deps } = await setup();
    const result = await listJobs(deps, { caller: viewer, companyId: company, days: 'all' });
    expect(result.ok && result.value.jobs).toHaveLength(5);
    expect(result.ok && result.value.since).toBeUndefined();
  });

  it('refuses staff from another company', async () => {
    const { deps } = await setup();
    const result = await listJobs(deps, { caller: stranger, companyId: company });
    expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
  });

  it('never returns more than the cap, keeping the newest', async () => {
    const clock = new FakeClock();
    const repo = new InMemoryJobRepository();
    for (let i = 0; i < JOB_LIST_LIMIT + 3; i++) {
      await repo.save(job(`job-${i}`, i / 100, clock.now()));
    }
    const result = await listJobs({ repo, clock }, { caller: viewer, companyId: company });
    expect(result.ok && result.value.jobs).toHaveLength(JOB_LIST_LIMIT);
    expect(result.ok && result.value.jobs[0]?.reference).toBe('job-0');
  });
});
