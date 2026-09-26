import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { GeoPoint } from '../domain/congestion-report.js';
import { InMemoryCongestionRepository } from './testing/in-memory-congestion-repository.js';
import {
  reportCongestion,
  type ReportCongestionDeps,
  type ReportCongestionInput,
} from './report-congestion.js';

const reporterId = makeId<'DriverId'>('driver-1');
const location: GeoPoint = { lat: 54.97, lon: -2.1 };

function buildDeps(overrides: Partial<ReportCongestionDeps> = {}): ReportCongestionDeps {
  return {
    repo: new InMemoryCongestionRepository(),
    clock: new FakeClock(),
    ...overrides,
  };
}

function input(overrides: Partial<ReportCongestionInput> = {}): ReportCongestionInput {
  return {
    id: makeId<'CongestionReportId'>('report-1'),
    reporterId,
    location,
    estimatedWaitMinutes: 15,
    ...overrides,
  };
}

describe('reportCongestion', () => {
  it('creates and persists a report, deriving expiresAt from estimatedWaitMinutes', async () => {
    const deps = buildDeps();
    const result = await reportCongestion(deps, input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const now = deps.clock.now();
    expect(result.value).toEqual({
      id: input().id,
      reporterId,
      location,
      estimatedWaitMinutes: 15,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
  });

  it('rejects a wait time outside 1-180 minutes without persisting anything', async () => {
    const deps = buildDeps();
    const repo = deps.repo as InMemoryCongestionRepository;
    const result = await reportCongestion(deps, input({ estimatedWaitMinutes: 0 }));
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidEstimatedWait', reason: 'out_of_range' },
    });
    expect(await repo.findNearbyLine([location], 1)).toEqual([]);
  });
});
