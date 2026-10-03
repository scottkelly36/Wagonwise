import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { DEFAULT_EXPIRY_DAYS, type HazardReport } from './hazard-report.js';
import { applyModeration, moderatedFields, queueReasons } from './moderation.js';

const now = new Date('2026-06-15T08:00:00.000Z');
const inAWeek = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

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

describe('applyModeration', () => {
  it('approve leaves the report exactly as it was (the decision is the approval)', () => {
    const r = report();
    expect(applyModeration(r, { kind: 'approve' }, now)).toEqual({ ok: true, value: r });
  });

  it('reject dismisses the report, the status everything already ignores', () => {
    const result = applyModeration(report(), { kind: 'reject' }, now);
    expect(result).toMatchObject({ ok: true, value: { status: 'dismissed' } });
  });

  describe('edit', () => {
    it('changes the measurement, and null removes it', () => {
      const measured = report({ measurement: { kind: 'height', value: 4, unit: 'm' } });
      const fixed = applyModeration(
        measured,
        { kind: 'edit', measurement: { kind: 'height', value: 3.5, unit: 'm' } },
        now,
      );
      expect(fixed).toMatchObject({ ok: true, value: { measurement: { value: 3.5 } } });

      const removed = applyModeration(measured, { kind: 'edit', measurement: null }, now);
      expect(removed.ok && removed.value.measurement).toBeUndefined();
    });

    it('leaves the measurement alone when the edit does not mention it', () => {
      const measured = report({ measurement: { kind: 'height', value: 4, unit: 'm' } });
      const result = applyModeration(measured, { kind: 'edit', type: 'width_restriction' }, now);
      expect(result.ok && result.value.measurement).toEqual({
        kind: 'height',
        value: 4,
        unit: 'm',
      });
    });

    it('refuses a measurement that is not a positive number', () => {
      for (const value of [0, -1, Number.NaN]) {
        const result = applyModeration(
          report(),
          { kind: 'edit', measurement: { kind: 'height', value, unit: 'm' } },
          now,
        );
        expect(result).toEqual({
          ok: false,
          error: { tag: 'InvalidMeasurement', reason: 'must_be_positive' },
        });
      }
    });

    it('gives a retyped report its new type’s expiry: a temporary type gains one, a permanent loses it', () => {
      const toTemporary = applyModeration(report(), { kind: 'edit', type: 'roadworks' }, now);
      expect(toTemporary.ok && toTemporary.value.expiresAt).toEqual(inAWeek);

      const temporary = report({ type: 'roadworks', expiresAt: inAWeek });
      const toPermanent = applyModeration(temporary, { kind: 'edit', type: 'low_bridge' }, now);
      expect(toPermanent.ok && toPermanent.value.expiresAt).toBeUndefined();
    });

    it('keeps the expiry when only the measurement changes', () => {
      const temporary = report({ type: 'roadworks', expiresAt: inAWeek });
      const result = applyModeration(
        temporary,
        { kind: 'edit', measurement: { kind: 'width', value: 2.5, unit: 'm' } },
        now,
      );
      expect(result.ok && result.value.expiresAt).toEqual(inAWeek);
    });
  });

  describe('set_lifetime', () => {
    it('permanent removes the expiry', () => {
      const result = applyModeration(
        report({ type: 'roadworks', expiresAt: inAWeek }),
        { kind: 'set_lifetime', lifetime: 'permanent' },
        now,
      );
      expect(result.ok && result.value.expiresAt).toBeUndefined();
    });

    it('temporary sets the default window from now', () => {
      const result = applyModeration(
        report(),
        { kind: 'set_lifetime', lifetime: 'temporary' },
        now,
      );
      expect(result.ok && result.value.expiresAt).toEqual(inAWeek);
    });
  });
});

describe('moderatedFields', () => {
  it('captures just what moderation can change', () => {
    const r = report({ measurement: { kind: 'height', value: 4, unit: 'm' }, expiresAt: inAWeek });
    expect(moderatedFields(r)).toEqual({
      type: 'low_bridge',
      measurement: { kind: 'height', value: 4, unit: 'm' },
      status: 'active',
      expiresAt: inAWeek,
    });
  });
});

describe('queueReasons', () => {
  it('queues an unapproved active blocking report', () => {
    expect(queueReasons(report(), false)).toEqual(['blocking_unreviewed']);
  });

  it('does not queue an advisory report with a quiet history', () => {
    expect(queueReasons(report({ type: 'tight_bend' }), false)).toEqual([]);
  });

  it('queues a disputed report even if it is advisory', () => {
    expect(
      queueReasons(report({ type: 'roadworks', confirmations: 1, dismissals: 1 }), false),
    ).toEqual(['disputed']);
  });

  it('gives both reasons when a blocking report is also disputed', () => {
    expect(queueReasons(report({ confirmations: 2, dismissals: 1 }), false)).toEqual([
      'blocking_unreviewed',
      'disputed',
    ]);
  });

  it('leaves out anything already approved, and anything no longer active', () => {
    expect(queueReasons(report(), true)).toEqual([]);
    expect(queueReasons(report({ status: 'dismissed' }), false)).toEqual([]);
    expect(queueReasons(report({ status: 'expired' }), false)).toEqual([]);
  });
});
