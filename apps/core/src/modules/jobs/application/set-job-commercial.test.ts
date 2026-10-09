import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { MAX_PRICE_PENCE, validateCommercial, type Job } from '../domain/job.js';
import { createJob } from './create-job.js';
import type { Caller } from './ports/caller-directory.js';
import { setJobCommercial } from './set-job-commercial.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const dispatcher: Caller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const viewer: Caller = { kind: 'fleet', companyId: acme, privileges: [] };
const outsider: Caller = { kind: 'fleet', companyId: beta, privileges: ['dispatch'] };
const stops = [{ kind: 'delivery' as const, name: 'Port', location: { lat: 54.97, lon: -1.6 } }];

async function setup(extra: { customer?: string; pricePence?: number } = {}) {
  const repo = new InMemoryJobRepository();
  const made = await createJob(
    { repo, ids: new SequentialIdGenerator(), clock: new FakeClock('2026-10-09T09:00:00.000Z') },
    { caller: dispatcher, companyId: acme, reference: 'JOB-1', stops, ...extra },
  );
  if (!made.ok) throw new Error('setup');
  return { repo, job: made.value };
}

describe('validateCommercial', () => {
  it('trims the customer, drops a blank one, and accepts a price in whole pence', () => {
    expect(validateCommercial({ customer: '  Acme Ltd  ', pricePence: 12_500 })).toEqual({
      ok: true,
      value: { customer: 'Acme Ltd', pricePence: 12_500 },
    });
    expect(validateCommercial({ customer: '   ', pricePence: 0 })).toEqual({
      ok: true,
      value: { customer: undefined, pricePence: 0 },
    });
    expect(validateCommercial({ customer: null, pricePence: null })).toEqual({
      ok: true,
      value: { customer: undefined, pricePence: undefined },
    });
  });

  it('refuses a long customer, a negative or fractional price, and a typing slip', () => {
    expect(validateCommercial({ customer: 'x'.repeat(121) })).toEqual({
      ok: false,
      error: { tag: 'InvalidCommercial', reason: 'customer_too_long' },
    });
    for (const pricePence of [-1, 10.5, MAX_PRICE_PENCE + 1, Number.NaN]) {
      expect(validateCommercial({ pricePence })).toEqual({
        ok: false,
        error: { tag: 'InvalidCommercial', reason: 'bad_price' },
      });
    }
  });
});

describe('createJob with a customer and price', () => {
  it('keeps them on the job, and refuses a bad price', async () => {
    const { job } = await setup({ customer: 'Acme Ltd', pricePence: 45_000 });
    expect(job).toMatchObject({ customer: 'Acme Ltd', pricePence: 45_000 });
    const repo = new InMemoryJobRepository();
    const bad = await createJob(
      { repo, ids: new SequentialIdGenerator(), clock: new FakeClock() },
      { caller: dispatcher, companyId: acme, reference: 'J', stops, pricePence: -5 },
    );
    expect(bad.ok).toBe(false);
  });
});

describe('setJobCommercial', () => {
  it('sets, changes and clears them, leaving a field that is not mentioned as it was', async () => {
    const { repo, job } = await setup({ customer: 'Acme Ltd', pricePence: 45_000 });
    const priced = await setJobCommercial(
      { repo },
      { caller: dispatcher, jobId: job.id, pricePence: 50_000 },
    );
    expect(priced.ok && priced.value).toMatchObject({ customer: 'Acme Ltd', pricePence: 50_000 });
    const cleared = await setJobCommercial(
      { repo },
      { caller: dispatcher, jobId: job.id, customer: null },
    );
    const after = cleared.ok ? cleared.value : undefined;
    expect(after?.customer).toBeUndefined();
    expect(after?.pricePence).toBe(50_000);
    expect((await repo.findById(job.id))?.pricePence).toBe(50_000);
  });

  it('can be corrected after delivery, because a price is often agreed late', async () => {
    const { repo, job } = await setup();
    const delivered: Job = { ...job, status: 'delivered' };
    await repo.save(delivered);
    const result = await setJobCommercial(
      { repo },
      { caller: dispatcher, jobId: job.id, pricePence: 9_900 },
    );
    expect(result.ok && result.value.pricePence).toBe(9_900);
  });

  it('is for dispatchers: others are refused, another company’s job is hidden, a bad price is refused', async () => {
    const { repo, job } = await setup();
    expect(
      await setJobCommercial({ repo }, { caller: viewer, jobId: job.id, pricePence: 1 }),
    ).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(
      await setJobCommercial({ repo }, { caller: outsider, jobId: job.id, pricePence: 1 }),
    ).toEqual({ ok: false, error: { tag: 'JobNotFound' } });
    const bad = await setJobCommercial(
      { repo },
      { caller: dispatcher, jobId: job.id, pricePence: -1 },
    );
    expect(bad.ok).toBe(false);
    expect((await repo.findById(job.id))?.pricePence).toBeUndefined();
  });
});
