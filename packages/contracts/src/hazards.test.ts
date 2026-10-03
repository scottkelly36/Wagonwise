import { describe, expect, it } from 'vitest';
import {
  hazardReportIdParamsSchema,
  hazardReportSchema,
  hazardTypeSchema,
  measurementSchema,
  moderateHazardRequestSchema,
  parseVoiceHazardReportRequestSchema,
  parsedVoiceHazardReportSchema,
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

describe('parseVoiceHazardReportRequestSchema', () => {
  it('requires a non-empty transcript', () => {
    expect(
      parseVoiceHazardReportRequestSchema.safeParse({ transcript: 'low bridge ahead' }).success,
    ).toBe(true);
    expect(parseVoiceHazardReportRequestSchema.safeParse({ transcript: '' }).success).toBe(false);
    expect(parseVoiceHazardReportRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('parsedVoiceHazardReportSchema', () => {
  it('requires only type; note, measurement and positionHint are optional', () => {
    expect(parsedVoiceHazardReportSchema.safeParse({ type: 'other' }).success).toBe(true);
  });

  it('accepts note, measurement and positionHint together', () => {
    const result = parsedVoiceHazardReportSchema.safeParse({
      type: 'low_bridge',
      note: 'Low bridge reported',
      measurement: { kind: 'height', value: 3.5, unit: 'm' },
      positionHint: 'just past the roundabout',
    });
    expect(result.success).toBe(true);
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

describe('moderateHazardRequestSchema', () => {
  const parse = (body: unknown) => moderateHazardRequestSchema.safeParse(body);

  it('accepts each action in its own shape', () => {
    expect(parse({ action: 'approve' }).success).toBe(true);
    expect(parse({ action: 'reject', note: 'duplicate of another report' }).success).toBe(true);
    expect(parse({ action: 'set_lifetime', lifetime: 'permanent' }).success).toBe(true);
    expect(
      parse({
        action: 'edit',
        type: 'weight_limit',
        measurement: { kind: 'weight', value: 7.5, unit: 't' },
      }).success,
    ).toBe(true);
  });

  it('lets an edit remove the measurement with null, and leave it alone by omitting it', () => {
    expect(parse({ action: 'edit', measurement: null }).success).toBe(true);
    expect(parse({ action: 'edit' }).success).toBe(true);
  });

  it('refuses an unknown action, a missing lifetime, a bad measurement or an over-long note', () => {
    expect(parse({ action: 'banish' }).success).toBe(false);
    expect(parse({ action: 'set_lifetime' }).success).toBe(false);
    expect(parse({ action: 'set_lifetime', lifetime: 'forever' }).success).toBe(false);
    expect(
      parse({ action: 'edit', measurement: { kind: 'height', value: 0, unit: 'm' } }).success,
    ).toBe(false);
    expect(parse({ action: 'approve', note: 'x'.repeat(501) }).success).toBe(false);
  });
});
