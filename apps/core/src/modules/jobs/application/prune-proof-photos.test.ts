import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { Job, JobStop } from '../domain/job.js';
import { monthsAgo, pruneProofPhotos } from './prune-proof-photos.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const ACME = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const OTHER = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const delivery: JobStop = { kind: 'delivery', name: 'Mart', location: { lat: 55, lon: -2 } };

function job(id: string, companyId: typeof ACME): Job {
  return {
    id: makeId<'JobId'>(id),
    companyId,
    reference: id,
    stops: [delivery],
    status: 'delivered',
    timeline: [],
    requiresProofOfDelivery: true,
    hasProofOfDelivery: false,
    currentStop: 1,
    proofStops: [],
  };
}

describe('monthsAgo', () => {
  it('goes back calendar months', () => {
    expect(monthsAgo(new Date('2026-10-08T12:00:00.000Z'), 12).toISOString()).toBe(
      '2025-10-08T12:00:00.000Z',
    );
    expect(monthsAgo(new Date('2026-10-08T12:00:00.000Z'), 3).toISOString()).toBe(
      '2026-07-08T12:00:00.000Z',
    );
  });
});

describe('pruneProofPhotos', () => {
  it("deletes each company's old photos by its own setting, and leaves the job and newer photos", async () => {
    const repo = new InMemoryJobRepository();
    const clock = new FakeClock('2026-10-08T12:00:00.000Z');
    await repo.save(job('acme-old', ACME));
    await repo.save(job('acme-new', ACME));
    await repo.save(job('other-old', OTHER));
    const photo = { contentType: 'image/jpeg', data: Buffer.from('p') };
    for (const id of ['acme-old', 'acme-new', 'other-old']) {
      await repo.saveProofOfDelivery(makeId<'JobId'>(id), 0, photo);
    }
    // Take the photo times back: acme-old 8 months, acme-new 1 month, other-old 8 months.
    const age = (id: string, months: number) => {
      const stored = repo.proofOfDelivery.get(makeId<'JobId'>(id))!.get(0)!;
      repo.proofOfDelivery
        .get(makeId<'JobId'>(id))!
        .set(0, { ...stored, capturedAt: monthsAgo(clock.now(), months) });
    };
    age('acme-old', 8);
    age('acme-new', 1);
    age('other-old', 8);

    // Acme keeps 6 months; Other keeps 12.
    const removed = await pruneProofPhotos(
      { repo, clock },
      {
        retentionMonthsByCompany: new Map([
          [ACME, 6],
          [OTHER, 12],
        ]),
      },
    );

    expect(removed).toBe(1);
    expect(repo.proofOfDelivery.get(makeId<'JobId'>('acme-old'))!.size).toBe(0);
    expect(repo.proofOfDelivery.get(makeId<'JobId'>('acme-new'))!.size).toBe(1);
    expect(repo.proofOfDelivery.get(makeId<'JobId'>('other-old'))!.size).toBe(1);
    // The job itself stays, now without a photo.
    const kept = await repo.findById(makeId<'JobId'>('acme-old'));
    expect(kept?.status).toBe('delivered');
    expect(kept?.proofStops).toEqual([]);
  });

  it('leaves a company with no setting alone', async () => {
    const repo = new InMemoryJobRepository();
    const removed = await pruneProofPhotos(
      { repo, clock: new FakeClock('2026-10-08T12:00:00.000Z') },
      { retentionMonthsByCompany: new Map() },
    );
    expect(removed).toBe(0);
  });
});
