import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from '../domain/hazard-report.js';
import { InMemoryHazardRepository } from './testing/in-memory-hazard-repository.js';
import { listHazards } from './list-hazards.js';

function report(overrides: Partial<HazardReport> = {}): HazardReport {
  return {
    id: makeId<'HazardReportId'>('report-1'),
    reporterId: makeId<'DriverId'>('driver-1'),
    type: 'low_bridge',
    location: { lat: 54.97, lon: -2.1 },
    source: 'tap',
    confirmations: 0,
    dismissals: 0,
    status: 'active',
    createdAt: new Date('2026-09-27T08:00:00.000Z'),
    ...overrides,
  };
}

describe('listHazards', () => {
  it('returns every report, whatever its status', async () => {
    const repo = new InMemoryHazardRepository();
    await repo.save(report());
    await repo.save(report({ id: makeId<'HazardReportId'>('report-2'), status: 'dismissed' }));

    const result = await listHazards({ repo });
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when there are no reports', async () => {
    const repo = new InMemoryHazardRepository();
    expect(await listHazards({ repo })).toEqual([]);
  });
});
