import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from './hazard-report.js';
import { findMergeCandidate } from './merge-policy.js';

const now = new Date('2026-06-15T08:00:00.000Z');

function report(overrides: Partial<HazardReport> = {}): HazardReport {
  return {
    id: makeId<'HazardReportId'>('hazard-1'),
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

describe('findMergeCandidate', () => {
  it('matches a candidate of the same type reported within the last 24h', () => {
    const candidate = report({ createdAt: new Date(now.getTime() - 1000) });
    const found = findMergeCandidate([candidate], { type: 'low_bridge', at: now });
    expect(found).toBe(candidate);
  });

  it('does not match a different type, however close', () => {
    const candidate = report({ type: 'weight_limit' });
    const found = findMergeCandidate([candidate], { type: 'low_bridge', at: now });
    expect(found).toBeUndefined();
  });

  it('does not match a candidate reported more than 24h ago', () => {
    const candidate = report({ createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000 - 1) });
    const found = findMergeCandidate([candidate], { type: 'low_bridge', at: now });
    expect(found).toBeUndefined();
  });

  it('matches a candidate reported exactly 24h ago (boundary is inclusive)', () => {
    const candidate = report({ createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) });
    const found = findMergeCandidate([candidate], { type: 'low_bridge', at: now });
    expect(found).toBe(candidate);
  });

  it('does not match a dismissed candidate', () => {
    const candidate = report({ status: 'dismissed' });
    const found = findMergeCandidate([candidate], { type: 'low_bridge', at: now });
    expect(found).toBeUndefined();
  });

  it('does not match an expired candidate', () => {
    const candidate = report({ status: 'expired' });
    const found = findMergeCandidate([candidate], { type: 'low_bridge', at: now });
    expect(found).toBeUndefined();
  });

  it('returns undefined for an empty candidate list', () => {
    expect(findMergeCandidate([], { type: 'low_bridge', at: now })).toBeUndefined();
  });

  it('picks the first matching candidate when more than one qualifies', () => {
    const first = report({ id: makeId<'HazardReportId'>('hazard-a') });
    const second = report({ id: makeId<'HazardReportId'>('hazard-b') });
    const found = findMergeCandidate([first, second], { type: 'low_bridge', at: now });
    expect(found).toBe(first);
  });
});
