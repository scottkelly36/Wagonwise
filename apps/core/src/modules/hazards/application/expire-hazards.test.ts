import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { HazardReport } from '../domain/hazard-report.js';
import { expireHazards } from './expire-hazards.js';
import { InMemoryHazardRepository } from './testing/in-memory-hazard-repository.js';

const now = new Date('2026-06-15T08:00:00.000Z');

function report(overrides: Partial<HazardReport> = {}): HazardReport {
  return {
    id: makeId<'HazardReportId'>('report-1'),
    reporterId: makeId<'DriverId'>('driver-1'),
    type: 'roadworks',
    location: { lat: 54.97, lon: -2.1 },
    source: 'tap',
    confirmations: 0,
    dismissals: 0,
    status: 'active',
    createdAt: now,
    ...overrides,
  };
}

describe('expireHazards', () => {
  it('expires an active report past its expiresAt and persists the change', async () => {
    const repo = new InMemoryHazardRepository();
    const overdue = report({ id: makeId<'HazardReportId'>('overdue'), expiresAt: now });
    await repo.save(overdue);

    const expired = await expireHazards({ repo, clock: new FakeClock(now) });
    expect(expired).toEqual([{ ...overdue, status: 'expired' }]);
    expect(await repo.findById(overdue.id)).toEqual({ ...overdue, status: 'expired' });
  });

  it('leaves a report that has not reached its expiresAt yet', async () => {
    const repo = new InMemoryHazardRepository();
    const notYet = report({
      id: makeId<'HazardReportId'>('not-yet'),
      expiresAt: new Date(now.getTime() + 1000),
    });
    await repo.save(notYet);

    const expired = await expireHazards({ repo, clock: new FakeClock(now) });
    expect(expired).toEqual([]);
    expect(await repo.findById(notYet.id)).toEqual(notYet);
  });

  it('leaves a permanent-type report with no expiresAt alone', async () => {
    const repo = new InMemoryHazardRepository();
    const permanent = report({ id: makeId<'HazardReportId'>('permanent'), type: 'low_bridge' });
    await repo.save(permanent);

    const expired = await expireHazards({ repo, clock: new FakeClock(now) });
    expect(expired).toEqual([]);
  });

  it('returns an empty array, not a failure, when there is nothing to expire', async () => {
    const repo = new InMemoryHazardRepository();
    expect(await expireHazards({ repo, clock: new FakeClock(now) })).toEqual([]);
  });
});
