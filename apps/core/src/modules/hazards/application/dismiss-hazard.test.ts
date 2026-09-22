import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { DISMISS_MARGIN, type HazardReport } from '../domain/hazard-report.js';
import { dismissHazard, type DismissHazardDeps } from './dismiss-hazard.js';
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

async function seeded(report: HazardReport): Promise<DismissHazardDeps> {
  const repo = new InMemoryHazardRepository();
  await repo.save(report);
  return { repo };
}

describe('dismissHazard', () => {
  it('increments dismissals and persists the result', async () => {
    const deps = await seeded(freshReport());
    const result = await dismissHazard(deps, { id: reportId });
    expect(result).toEqual({ ok: true, value: freshReport({ dismissals: 1 }) });
    expect(await deps.repo.findById(reportId)).toEqual(freshReport({ dismissals: 1 }));
  });

  it(`moves to dismissed once dismissals exceed confirmations by ${DISMISS_MARGIN}`, async () => {
    const deps = await seeded(freshReport({ dismissals: DISMISS_MARGIN - 1 }));
    const result = await dismissHazard(deps, { id: reportId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('dismissed');
  });

  it('returns HazardReportNotFound for an unknown id', async () => {
    const deps = await seeded(freshReport());
    const result = await dismissHazard(deps, { id: makeId<'HazardReportId'>('nope') });
    expect(result).toEqual({ ok: false, error: { tag: 'HazardReportNotFound' } });
  });
});
