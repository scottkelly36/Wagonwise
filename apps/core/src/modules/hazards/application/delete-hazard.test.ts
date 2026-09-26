import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from '../domain/hazard-report.js';
import { deleteHazard, type DeleteHazardDeps } from './delete-hazard.js';
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

async function seeded(report: HazardReport): Promise<DeleteHazardDeps> {
  const repo = new InMemoryHazardRepository();
  await repo.save(report);
  return { repo };
}

describe('deleteHazard', () => {
  it('actually removes the row, unlike dismiss', async () => {
    const deps = await seeded(freshReport());
    const result = await deleteHazard(deps, { id: reportId });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await deps.repo.findById(reportId)).toBeNull();
  });

  it('returns HazardReportNotFound for an unknown id', async () => {
    const deps = await seeded(freshReport());
    const result = await deleteHazard(deps, { id: makeId<'HazardReportId'>('nope') });
    expect(result).toEqual({ ok: false, error: { tag: 'HazardReportNotFound' } });
  });

  it('returns HazardReportNotFound (not a crash) for a second delete of the same id', async () => {
    const deps = await seeded(freshReport());
    await deleteHazard(deps, { id: reportId });
    const result = await deleteHazard(deps, { id: reportId });
    expect(result).toEqual({ ok: false, error: { tag: 'HazardReportNotFound' } });
  });
});
