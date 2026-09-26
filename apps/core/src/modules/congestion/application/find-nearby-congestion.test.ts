import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { CongestionReport, GeoPoint } from '../domain/congestion-report.js';
import { InMemoryCongestionRepository } from './testing/in-memory-congestion-repository.js';
import { findNearbyCongestion, type FindNearbyCongestionDeps } from './find-nearby-congestion.js';

const location: GeoPoint = { lat: 54.97, lon: -2.1 };

function report(overrides: Partial<CongestionReport> = {}): CongestionReport {
  return {
    id: makeId<'CongestionReportId'>('report-1'),
    reporterId: makeId<'DriverId'>('driver-1'),
    location,
    estimatedWaitMinutes: 15,
    createdAt: new Date('2026-09-26T08:00:00.000Z'),
    expiresAt: new Date('2026-09-26T08:15:00.000Z'),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<FindNearbyCongestionDeps> = {}): FindNearbyCongestionDeps {
  return {
    repo: new InMemoryCongestionRepository(),
    clock: new FakeClock(new Date('2026-09-26T08:00:00.000Z')),
    ...overrides,
  };
}

describe('findNearbyCongestion', () => {
  it('returns a report that has not expired yet', async () => {
    const repo = new InMemoryCongestionRepository();
    const deps = buildDeps({ repo });
    await repo.save(report());
    const result = await findNearbyCongestion(deps, { corridor: [location], radiusM: 1000 });
    expect(result).toEqual([report()]);
  });

  it('filters out a report whose expiresAt has passed, even if still in the table', async () => {
    const repo = new InMemoryCongestionRepository();
    const deps = buildDeps({ repo, clock: new FakeClock(new Date('2026-09-26T08:20:00.000Z')) });
    await repo.save(report());
    const result = await findNearbyCongestion(deps, { corridor: [location], radiusM: 1000 });
    expect(result).toEqual([]);
  });
});
