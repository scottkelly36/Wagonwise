import { describe, expect, it } from 'vitest';
import {
  hazardReportIdParamsSchema,
  hazardReportSchema,
  hazardTypeSchema,
  measurementSchema,
  reportHazardRequestSchema,
} from './hazards.js';

describe('hazardTypeSchema', () => {
  it('accepts every design-doc hazard type', () => {
    for (const type of [
      'low_bridge',
      'weight_limit',
      'width_restriction',
      'tight_bend',
      'roadworks',
      'flooding',
      'no_hgv',
      'other',
    ]) {
      expect(hazardTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('rejects an unknown type', () => {
    expect(hazardTypeSchema.safeParse('pothole').success).toBe(false);
  });
});

describe('measurementSchema', () => {
  it('accepts a positive measurement', () => {
    expect(measurementSchema.safeParse({ kind: 'height', value: 3.5, unit: 'm' }).success).toBe(
      true,
    );
  });

  it('rejects a zero or negative value', () => {
    expect(measurementSchema.safeParse({ kind: 'height', value: 0, unit: 'm' }).success).toBe(
      false,
    );
  });
});

describe('reportHazardRequestSchema', () => {
  it('requires id, type, location and source; note/measurement are optional, no reporterId field', () => {
    const result = reportHazardRequestSchema.safeParse({
      id: 'report-1',
      type: 'low_bridge',
      location: { lat: 54.9707, lon: -2.1013 },
      source: 'tap',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a note and a measurement', () => {
    const result = reportHazardRequestSchema.safeParse({
      id: 'report-1',
      type: 'low_bridge',
      location: { lat: 54.9707, lon: -2.1013 },
      note: 'Looked lower than signed',
      measurement: { kind: 'height', value: 3.4, unit: 'm' },
      source: 'tap',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing location', () => {
    const result = reportHazardRequestSchema.safeParse({
      id: 'report-1',
      type: 'low_bridge',
      source: 'tap',
    });
    expect(result.success).toBe(false);
  });
});

describe('hazardReportIdParamsSchema', () => {
  it('requires a well-formed UUID', () => {
    expect(hazardReportIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(
      hazardReportIdParamsSchema.safeParse({ id: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
  });
});

describe('hazardReportSchema', () => {
  it('parses a real response shape, with note/measurement/expiresAt absent', () => {
    const result = hazardReportSchema.safeParse({
      id: 'report-1',
      reporterId: 'driver-1',
      type: 'low_bridge',
      location: { lat: 54.9707, lon: -2.1013 },
      source: 'tap',
      confirmations: 0,
      dismissals: 0,
      status: 'active',
      createdAt: '2026-06-15T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('parses a response shape with note, measurement and expiresAt present', () => {
    const result = hazardReportSchema.safeParse({
      id: 'report-1',
      reporterId: 'driver-1',
      type: 'roadworks',
      location: { lat: 54.9707, lon: -2.1013 },
      note: 'Single lane closure',
      measurement: { kind: 'width', value: 2.1, unit: 'm' },
      source: 'voice',
      confirmations: 1,
      dismissals: 0,
      status: 'active',
      expiresAt: '2026-06-22T08:00:00.000Z',
      createdAt: '2026-06-15T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
