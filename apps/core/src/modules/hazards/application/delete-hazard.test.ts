import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from '../domain/hazard-report.js';
import { deleteHazard, type DeleteHazardDeps } from './delete-hazard.js';
import { InMemoryHazardRepository } from './testing/in-memory-hazard-repository.js';
import { StubAdminDirectory } from './testing/stub-admin-directory.js';

const reportId = makeId<'HazardReportId'>('report-1');
const ADMIN = makeId<'DriverId'>('admin');
const DRIVER = makeId<'DriverId'>('driver-1');

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
  return { repo, admins: new StubAdminDirectory(new Set([ADMIN])) };
}

describe('deleteHazard', () => {
  it('actually removes the row, unlike dismiss', async () => {
    const deps = await seeded(freshReport());
    const result = await deleteHazard(deps, { callerId: ADMIN, id: reportId });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await deps.repo.findById(reportId)).toBeNull();
  });

  it('returns HazardReportNotFound for an unknown id', async () => {
    const deps = await seeded(freshReport());
    const result = await deleteHazard(deps, {
      callerId: ADMIN,
      id: makeId<'HazardReportId'>('nope'),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'HazardReportNotFound' } });
  });

  it('returns HazardReportNotFound (not a crash) for a second delete of the same id', async () => {
    const deps = await seeded(freshReport());
    await deleteHazard(deps, { callerId: ADMIN, id: reportId });
    const result = await deleteHazard(deps, { callerId: ADMIN, id: reportId });
    expect(result).toEqual({ ok: false, error: { tag: 'HazardReportNotFound' } });
  });

  it('refuses a non-admin before looking the report up, leaving it in place', async () => {
    const deps = await seeded(freshReport());
    for (const id of [reportId, makeId<'HazardReportId'>('nope')]) {
      const result = await deleteHazard(deps, { callerId: DRIVER, id });
      expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    }
    expect(await deps.repo.findById(reportId)).not.toBeNull();
  });
});
