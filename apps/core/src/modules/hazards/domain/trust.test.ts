import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { HazardReport } from './hazard-report.js';
import { NO_RECORD, isHeldBackFromRouting, reporterTrust, trustScore } from './trust.js';

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
    createdAt: new Date('2026-06-15T08:00:00.000Z'),
    ...overrides,
  };
}

describe('reporterTrust', () => {
  it('a reporter with no history is neutral, never low', () => {
    expect(reporterTrust(NO_RECORD)).toBe('neutral');
  });

  it('one rejection or two community dismissals are not enough to be low', () => {
    expect(reporterTrust({ ...NO_RECORD, rejected: 1 })).toBe('neutral');
    expect(reporterTrust({ ...NO_RECORD, communityDismissed: 2 })).toBe('neutral');
  });

  it('is low after two rejections, a rejection plus a dismissal, or three dismissals', () => {
    expect(reporterTrust({ ...NO_RECORD, rejected: 2 })).toBe('low');
    expect(reporterTrust({ ...NO_RECORD, rejected: 1, communityDismissed: 1 })).toBe('low');
    expect(reporterTrust({ ...NO_RECORD, communityDismissed: 3 })).toBe('low');
  });

  it('approvals offset a bad record', () => {
    expect(reporterTrust({ approved: 2, rejected: 2, communityDismissed: 0 })).toBe('neutral');
  });

  it('is high after three approved reports with nothing against them', () => {
    expect(reporterTrust({ ...NO_RECORD, approved: 3 })).toBe('high');
    expect(reporterTrust({ ...NO_RECORD, approved: 2 })).toBe('neutral');
  });

  it('scores rejections at twice the weight of dismissals', () => {
    expect(trustScore({ approved: 0, rejected: 1, communityDismissed: 0 })).toBe(-2);
    expect(trustScore({ approved: 0, rejected: 0, communityDismissed: 1 })).toBe(-1);
  });
});

describe('isHeldBackFromRouting', () => {
  it('holds back a blocking report that is low-trust, unmeasured, unconfirmed and unapproved', () => {
    expect(isHeldBackFromRouting(report(), 'low', false)).toBe(true);
    expect(isHeldBackFromRouting(report({ type: 'no_hgv' }), 'low', false)).toBe(true);
  });

  it('never holds back a neutral or high-trust reporter, so new reporters always route', () => {
    expect(isHeldBackFromRouting(report(), 'neutral', false)).toBe(false);
    expect(isHeldBackFromRouting(report(), 'high', false)).toBe(false);
  });

  it('never holds back a report that carries a measurement', () => {
    const measured = report({ measurement: { kind: 'height', value: 3.5, unit: 'm' } });
    expect(isHeldBackFromRouting(measured, 'low', false)).toBe(false);
  });

  it('never holds back a report someone else has confirmed', () => {
    expect(isHeldBackFromRouting(report({ confirmations: 1 }), 'low', false)).toBe(false);
  });

  it('never holds back a report a moderator approved', () => {
    expect(isHeldBackFromRouting(report(), 'low', true)).toBe(false);
  });

  it('only concerns blocking types; advisory ones were never routed around', () => {
    expect(isHeldBackFromRouting(report({ type: 'roadworks' }), 'low', false)).toBe(false);
  });
});
