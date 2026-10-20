import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { CongestionReport } from '../domain/congestion-report.js';
import {
  clearExpiredCongestion,
  deleteCongestion,
  listCongestion,
  type AdminCongestionDeps,
  type StaffCaller,
} from './admin-congestion.js';
import { InMemoryCongestionRepository } from './testing/in-memory-congestion-repository.js';

const platform: StaffCaller = { kind: 'platform' };
const fleet: StaffCaller = { kind: 'fleet', companyId: 'c', privileges: ['manage_fleet'] };
const now = new Date('2026-10-20T12:00:00.000Z');

function report(n: number, minutesAgo: number, wait: number): CongestionReport {
  const createdAt = new Date(now.getTime() - minutesAgo * 60_000);
  return {
    id: makeId<'CongestionReportId'>(`00000000-0000-4000-8000-00000000000${n}`),
    reporterId: makeId<'DriverId'>('driver-1'),
    location: { lat: 54.97, lon: -2.1 },
    estimatedWaitMinutes: wait,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + wait * 60_000),
  };
}

async function setup() {
  const repo = new InMemoryCongestionRepository();
  const deps: AdminCongestionDeps = { repo, clock: new FakeClock(now) };
  await repo.save(report(1, 5, 20)); // still running: 15 minutes left
  await repo.save(report(2, 120, 20)); // ran out long ago
  await repo.save(report(3, 30, 20)); // ran out 10 minutes ago
  return { repo, deps };
}

describe('listCongestion', () => {
  it('lists every report newest first, says which still count, and counts them', async () => {
    const { deps } = await setup();
    const result = await listCongestion(deps, platform);
    expect(result.ok && result.value.reports.map((r) => [r.report.id.slice(-1), r.active])).toEqual(
      [
        ['1', true],
        ['3', false],
        ['2', false],
      ],
    );
    expect(result.ok && [result.value.total, result.value.active]).toEqual([3, 1]);
  });

  it('is for WagonWise staff only', async () => {
    const { deps } = await setup();
    expect(await listCongestion(deps, fleet)).toEqual({ ok: false, error: { tag: 'Forbidden' } });
  });
});

describe('deleteCongestion and clearExpiredCongestion', () => {
  it('removes one report, and says so for one that is not there', async () => {
    const { deps, repo } = await setup();
    const id = report(1, 5, 20).id;
    expect((await deleteCongestion(deps, platform, id)).ok).toBe(true);
    expect((await repo.counts(now)).total).toBe(2);
    expect(await deleteCongestion(deps, platform, id)).toEqual({
      ok: false,
      error: { tag: 'CongestionNotFound' },
    });
  });

  it('clears only the reports whose time has run out', async () => {
    const { deps, repo } = await setup();
    expect(await clearExpiredCongestion(deps, platform)).toEqual({ ok: true, value: 2 });
    expect(await repo.counts(now)).toEqual({ total: 1, active: 1 });
    expect(await clearExpiredCongestion(deps, platform)).toEqual({ ok: true, value: 0 });
  });

  it('are for WagonWise staff only, and change nothing for anyone else', async () => {
    const { deps, repo } = await setup();
    expect(await deleteCongestion(deps, fleet, report(1, 5, 20).id)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await clearExpiredCongestion(deps, fleet)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await repo.counts(now)).total).toBe(3);
  });
});
