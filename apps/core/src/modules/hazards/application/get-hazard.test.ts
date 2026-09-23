import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from '../domain/hazard-report.js';
import { getHazard, type GetHazardDeps } from './get-hazard.js';
import { InMemoryHazardRepository } from './testing/in-memory-hazard-repository.js';

const reportId = makeId<'HazardReportId'>('report-1');

function freshReport(overrides: Partial<HazardReport> = {}): HazardReport {
  return {
    id: reportId,
    reporterId: makeId<'DriverId'>('driver-1'),
    type: 'low_bridge',
    location: { lat: 54.97, lon: -2.1 },
    source: 'tap',
    confirmations: 0,
    dismissals: 0,
    status: 'active',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

async function seeded(report: HazardReport): Promise<GetHazardDeps> {
  const repo = new InMemoryHazardRepository();
  await repo.save(report);
  return { repo };
}

describe('getHazard', () => {
  it('returns the report for a known id', async () => {
    const report = freshReport();
    const deps = await seeded(report);
    const result = await getHazard(deps, { id: reportId });
    expect(result).toEqual({ ok: true, value: report });
  });

  it('returns HazardReportNotFound for an unknown id', async () => {
    const deps = await seeded(freshReport());
    const result = await getHazard(deps, { id: makeId<'HazardReportId'>('nope') });
    expect(result).toEqual({ ok: false, error: { tag: 'HazardReportNotFound' } });
  });
});
