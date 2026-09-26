import { describe, expect, it } from 'vitest';
import {
  congestionReportSchema,
  findNearbyCongestionRequestSchema,
  reportCongestionRequestSchema,
} from './congestion.js';

describe('reportCongestionRequestSchema', () => {
  it('requires id, location and estimatedWaitMinutes, no reporterId field', () => {
    const result = reportCongestionRequestSchema.safeParse({
      id: 'report-1',
      location: { lat: 54.9707, lon: -2.1013 },
      estimatedWaitMinutes: 15,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a wait time outside 1-180 minutes', () => {
    expect(
      reportCongestionRequestSchema.safeParse({
        id: 'report-1',
        location: { lat: 54.9707, lon: -2.1013 },
        estimatedWaitMinutes: 0,
      }).success,
    ).toBe(false);
    expect(
      reportCongestionRequestSchema.safeParse({
        id: 'report-1',
        location: { lat: 54.9707, lon: -2.1013 },
        estimatedWaitMinutes: 181,
      }).success,
    ).toBe(false);
  });

  it('rejects a missing location', () => {
    const result = reportCongestionRequestSchema.safeParse({
      id: 'report-1',
      estimatedWaitMinutes: 15,
    });
    expect(result.success).toBe(false);
  });
});

describe('findNearbyCongestionRequestSchema', () => {
  it('accepts a single-point corridor ("near me")', () => {
    const result = findNearbyCongestionRequestSchema.safeParse({
      corridor: [{ lat: 54.9707, lon: -2.1013 }],
      radiusM: 5000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty corridor', () => {
    const result = findNearbyCongestionRequestSchema.safeParse({ corridor: [], radiusM: 5000 });
    expect(result.success).toBe(false);
  });
});

describe('congestionReportSchema', () => {
  it('parses a real response shape', () => {
    const result = congestionReportSchema.safeParse({
      id: 'report-1',
      reporterId: 'driver-1',
      location: { lat: 54.9707, lon: -2.1013 },
      estimatedWaitMinutes: 15,
      createdAt: '2026-09-26T08:00:00.000Z',
      expiresAt: '2026-09-26T08:15:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
