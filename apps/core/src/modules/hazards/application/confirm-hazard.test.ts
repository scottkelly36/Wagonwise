import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { HazardReport } from '../domain/hazard-report.js';
import { confirmHazard, type ConfirmHazardDeps } from './confirm-hazard.js';
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

async function seeded(report: HazardReport): Promise<ConfirmHazardDeps> {
  const repo = new InMemoryHazardRepository();
  await repo.save(report);
  return {
    repo,
    clock: new FakeClock('2026-06-15T08:00:00.000Z'),
    ids: new SequentialIdGenerator(),
  };
}

describe('confirmHazard', () => {
  it('increments confirmations and persists the result', async () => {
    const deps = await seeded(freshReport());
    const result = await confirmHazard(deps, { id: reportId });
    expect(result).toEqual({ ok: true, value: freshReport({ confirmations: 1 }) });
    expect(await deps.repo.findById(reportId)).toEqual(freshReport({ confirmations: 1 }));
  });

  it('emits a HazardConfirmed event alongside the save (M6.3)', async () => {
    const deps = await seeded(freshReport());
    await confirmHazard(deps, { id: reportId });
    const repo = deps.repo as InMemoryHazardRepository;
    expect(repo.emittedEvents).toEqual([
      {
        eventId: '00000000-0000-4000-8000-000000000001',
        aggregateType: 'HazardReport',
        aggregateId: reportId,
        eventType: 'HazardConfirmed',
        payload: {
          hazardId: reportId,
          type: 'low_bridge',
          location: { lat: 54.97, lon: -2.1 },
          measurement: undefined,
        },
      },
    ]);
  });

  it('reactivates an expired report', async () => {
    const deps = await seeded(freshReport({ type: 'roadworks', status: 'expired' }));
    const result = await confirmHazard(deps, { id: reportId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('active');
  });

  it('returns HazardReportNotFound for an unknown id', async () => {
    const deps = await seeded(freshReport());
    const result = await confirmHazard(deps, { id: makeId<'HazardReportId'>('nope') });
    expect(result).toEqual({ ok: false, error: { tag: 'HazardReportNotFound' } });
  });
});
