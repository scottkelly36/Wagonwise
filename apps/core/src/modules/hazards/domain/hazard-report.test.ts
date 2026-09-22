import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  confirm,
  DEFAULT_EXPIRY_DAYS,
  DISMISS_MARGIN,
  dismiss,
  expire,
  expiryFor,
  isBlocking,
  isExpired,
  isTemporary,
  validateMeasurement,
  type HazardReport,
  type HazardType,
} from './hazard-report.js';

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

describe('isBlocking', () => {
  it.each<HazardType>(['low_bridge', 'weight_limit', 'width_restriction', 'no_hgv'])(
    '%s is blocking',
    (type) => {
      expect(isBlocking(type)).toBe(true);
    },
  );

  it.each<HazardType>(['tight_bend', 'roadworks', 'flooding', 'other'])(
    '%s is advisory, not blocking',
    (type) => {
      expect(isBlocking(type)).toBe(false);
    },
  );
});

describe('isTemporary / expiryFor', () => {
  it.each<HazardType>(['roadworks', 'flooding', 'other'])(
    '%s is temporary and gets a %d-day expiry',
    (type) => {
      expect(isTemporary(type)).toBe(true);
      const expiry = expiryFor(type, now);
      expect(expiry).toEqual(new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000));
    },
  );

  it.each<HazardType>(['low_bridge', 'weight_limit', 'width_restriction', 'no_hgv', 'tight_bend'])(
    '%s is permanent and never expires',
    (type) => {
      expect(isTemporary(type)).toBe(false);
      expect(expiryFor(type, now)).toBeUndefined();
    },
  );
});

describe('validateMeasurement', () => {
  it('accepts a positive value', () => {
    const result = validateMeasurement({ kind: 'height', value: 3.5, unit: 'm' });
    expect(result.ok).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (value) => {
    const result = validateMeasurement({ kind: 'height', value, unit: 'm' });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidMeasurement', reason: 'must_be_positive' },
    });
  });
});

describe('isExpired', () => {
  it('is false for a permanent-type report with no expiresAt', () => {
    expect(isExpired(report({ type: 'low_bridge', expiresAt: undefined }), now)).toBe(false);
  });

  it('is false before expiresAt', () => {
    const r = report({ type: 'roadworks', expiresAt: new Date(now.getTime() + 1000) });
    expect(isExpired(r, now)).toBe(false);
  });

  it('is true exactly at expiresAt (boundary is inclusive)', () => {
    const r = report({ type: 'roadworks', expiresAt: now });
    expect(isExpired(r, now)).toBe(true);
  });

  it('is true after expiresAt', () => {
    const r = report({ type: 'roadworks', expiresAt: new Date(now.getTime() - 1000) });
    expect(isExpired(r, now)).toBe(true);
  });

  it('is false for a report that is already dismissed, even past its expiresAt', () => {
    const r = report({
      type: 'roadworks',
      status: 'dismissed',
      expiresAt: new Date(now.getTime() - 1000),
    });
    expect(isExpired(r, now)).toBe(false);
  });
});

describe('expire', () => {
  it('moves status to expired without touching anything else', () => {
    const r = report({ type: 'roadworks', expiresAt: now });
    expect(expire(r)).toEqual({ ...r, status: 'expired' });
  });
});

describe('confirm', () => {
  it('increments confirmations', () => {
    const r = report({ confirmations: 2 });
    expect(confirm(r, now).confirmations).toBe(3);
  });

  it('reactivates an expired report — the point of "Still there?"', () => {
    const r = report({ type: 'roadworks', status: 'expired' });
    expect(confirm(r, now).status).toBe('active');
  });

  it('does not un-dismiss a dismissed report on a single confirmation', () => {
    const r = report({ status: 'dismissed', dismissals: 5 });
    expect(confirm(r, now).status).toBe('dismissed');
  });

  it('pushes expiresAt forward by the default window for a temporary type', () => {
    const r = report({ type: 'roadworks', expiresAt: new Date(now.getTime() + 1000) });
    const next = confirm(r, now);
    expect(next.expiresAt).toEqual(
      new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    );
  });

  it('leaves expiresAt untouched (undefined) for a permanent type', () => {
    const r = report({ type: 'low_bridge' });
    expect(confirm(r, now).expiresAt).toBeUndefined();
  });

  it('does not mutate the original report', () => {
    const r = report({ confirmations: 0 });
    confirm(r, now);
    expect(r.confirmations).toBe(0);
  });
});

describe('dismiss', () => {
  it('increments dismissals', () => {
    const r = report({ dismissals: 1 });
    expect(dismiss(r).dismissals).toBe(2);
  });

  it(`stays active below the ${DISMISS_MARGIN}-dismissal margin over confirmations`, () => {
    const r = report({ confirmations: 0, dismissals: DISMISS_MARGIN - 2 });
    expect(dismiss(r).status).toBe('active');
  });

  it(`moves to dismissed once dismissals exceed confirmations by ${DISMISS_MARGIN}`, () => {
    const r = report({ confirmations: 0, dismissals: DISMISS_MARGIN - 1 });
    expect(dismiss(r).status).toBe('dismissed');
  });

  it('weighs confirmations against dismissals, not just a raw dismissal count', () => {
    const r = report({ confirmations: 10, dismissals: 10 + DISMISS_MARGIN - 2 });
    expect(dismiss(r).status).toBe('active');
  });

  it('does not resurrect an already-expired report', () => {
    const r = report({ type: 'roadworks', status: 'expired', confirmations: 0, dismissals: 10 });
    expect(dismiss(r).status).toBe('expired');
  });

  it('leaves an already-dismissed report dismissed', () => {
    const r = report({ status: 'dismissed', confirmations: 0, dismissals: 10 });
    expect(dismiss(r).status).toBe('dismissed');
  });

  it('does not mutate the original report', () => {
    const r = report({ dismissals: 0 });
    dismiss(r);
    expect(r.dismissals).toBe(0);
  });
});
