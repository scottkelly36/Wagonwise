import { describe, expect, it } from 'vitest';
import {
  findNearbySafeParkingSpotsRequestSchema,
  reportSafeParkingSpotRequestSchema,
  safeParkingSpotSchema,
} from './parking.js';

describe('reportSafeParkingSpotRequestSchema', () => {
  it('requires id and location, note optional, no reporterId field', () => {
    expect(
      reportSafeParkingSpotRequestSchema.safeParse({
        id: 'spot-1',
        location: { lat: 54.9707, lon: -2.1013 },
      }).success,
    ).toBe(true);
    expect(
      reportSafeParkingSpotRequestSchema.safeParse({
        id: 'spot-1',
        location: { lat: 54.9707, lon: -2.1013 },
        note: 'flat layby, room for a 44-tonner',
      }).success,
    ).toBe(true);
  });

  it('rejects a note over the max length', () => {
    expect(
      reportSafeParkingSpotRequestSchema.safeParse({
        id: 'spot-1',
        location: { lat: 54.9707, lon: -2.1013 },
        note: 'x'.repeat(281),
      }).success,
    ).toBe(false);
  });
});

describe('findNearbySafeParkingSpotsRequestSchema', () => {
  it('requires a non-empty corridor and a positive radius', () => {
    expect(
      findNearbySafeParkingSpotsRequestSchema.safeParse({ corridor: [], radiusM: 5000 }).success,
    ).toBe(false);
    expect(
      findNearbySafeParkingSpotsRequestSchema.safeParse({
        corridor: [{ lat: 54.9707, lon: -2.1013 }],
        radiusM: 5000,
      }).success,
    ).toBe(true);
  });
});

describe('safeParkingSpotSchema', () => {
  it('accepts a spot with no note', () => {
    expect(
      safeParkingSpotSchema.safeParse({
        id: 'spot-1',
        reporterId: 'driver-1',
        location: { lat: 54.9707, lon: -2.1013 },
        reportedAt: '2026-09-27T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
