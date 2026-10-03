import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from '../domain/hazard-report.js';
import type { ModerationDecision } from '../domain/moderation.js';
import { InMemoryHazardRepository } from './testing/in-memory-hazard-repository.js';
import { assessReports } from './trust.js';

const now = new Date('2026-06-15T08:00:00.000Z');
let counter = 0;

function report(overrides: Partial<HazardReport> = {}): HazardReport {
  counter += 1;
  return {
    id: makeId<'HazardReportId'>(`hazard-${counter}`),
    reporterId: makeId<'DriverId'>('driver-1'),
    type: 'low_bridge',
    location: { lat: 54.97, lon: -2.1 },
    source: 'tap',
    confirmations: 0,
    dismissals: 0,
    status: 'active',
    createdAt: now,
    ...overrides,
  };
}

function decision(r: HazardReport, action: 'approve' | 'reject'): ModerationDecision {
  const fields = { type: r.type, status: r.status };
  return {
    id: makeId<'ModerationDecisionId'>(`decision-${counter++}`),
    hazardId: r.id,
    moderatorId: makeId<'StaffId'>('staff-1'),
    action,
    before: fields,
    after: fields,
    decidedAt: now,
  };
}

describe('assessReports', () => {
  let repo: InMemoryHazardRepository;

  /** Gives `driver-1` a record of two moderator-rejected reports: low trust. */
  async function makeReporterLowTrust(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      const bad = report({ status: 'dismissed' });
      await repo.saveModerated(bad, decision(bad, 'reject'), []);
    }
  }

  beforeEach(() => {
    repo = new InMemoryHazardRepository();
  });

  it('never holds back a first-time reporter', async () => {
    const fresh = report();
    await repo.save(fresh);
    const result = await assessReports(repo, [fresh], { forDisplay: false });
    expect(result.get(fresh.id)).toEqual({ trust: 'neutral', heldBackFromRouting: false });
  });

  it('holds back an unmeasured, unconfirmed blocking report from a low-trust reporter', async () => {
    await makeReporterLowTrust();
    const doubtful = report();
    await repo.save(doubtful);
    const result = await assessReports(repo, [doubtful], { forDisplay: false });
    expect(result.get(doubtful.id)).toEqual({ trust: 'low', heldBackFromRouting: true });
  });

  it('routes the same report once it has a measurement or a confirmation', async () => {
    await makeReporterLowTrust();
    const measured = report({ measurement: { kind: 'height', value: 3.5, unit: 'm' } });
    const confirmed = report({ confirmations: 1 });
    await repo.save(measured);
    await repo.save(confirmed);
    const result = await assessReports(repo, [measured, confirmed], { forDisplay: false });
    expect(result.get(measured.id)?.heldBackFromRouting ?? false).toBe(false);
    expect(result.get(confirmed.id)?.heldBackFromRouting ?? false).toBe(false);
  });

  it('routes the report again once a moderator approves it', async () => {
    await makeReporterLowTrust();
    const doubtful = report();
    await repo.saveModerated(doubtful, decision(doubtful, 'approve'), []);
    const result = await assessReports(repo, [doubtful], { forDisplay: false });
    expect(result.get(doubtful.id)?.heldBackFromRouting).toBe(false);
  });

  it('counts a community dismissal against the reporter, but not twice when a moderator rejected it', async () => {
    for (let i = 0; i < 3; i++) {
      await repo.save(report({ status: 'dismissed' }));
    }
    const doubtful = report();
    await repo.save(doubtful);
    const result = await assessReports(repo, [doubtful], { forDisplay: false });
    expect(result.get(doubtful.id)?.trust).toBe('low');
  });

  it('another reporter is not affected by this reporter’s record', async () => {
    await makeReporterLowTrust();
    const other = report({ reporterId: makeId<'DriverId'>('driver-2') });
    await repo.save(other);
    const result = await assessReports(repo, [other], { forDisplay: false });
    expect(result.get(other.id)?.heldBackFromRouting).toBe(false);
  });

  it('shows trust for every report when asked to for display', async () => {
    for (let i = 0; i < 3; i++) {
      const good = report();
      await repo.saveModerated(good, decision(good, 'approve'), []);
    }
    const measured = report({ measurement: { kind: 'height', value: 3.5, unit: 'm' } });
    const result = await assessReports(repo, [measured], { forDisplay: true });
    expect(result.get(measured.id)).toEqual({ trust: 'high', heldBackFromRouting: false });
  });
});
