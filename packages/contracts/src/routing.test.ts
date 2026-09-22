import { describe, expect, it } from 'vitest';
import {
  createVehicleProfileRequestSchema,
  dimensionsSchema,
  geoPointSchema,
  planRouteRequestSchema,
  routePlanSchema,
  updateVehicleProfileRequestSchema,
  vehicleProfileIdParamsSchema,
  vehicleProfileSchema,
} from './routing.js';

const validDimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

describe('dimensionsSchema', () => {
  it('accepts realistic dimensions with axleWeightT omitted', () => {
    expect(dimensionsSchema.safeParse(validDimensions).success).toBe(true);
  });

  it('accepts a positive axleWeightT', () => {
    expect(dimensionsSchema.safeParse({ ...validDimensions, axleWeightT: 10 }).success).toBe(true);
  });

  it('rejects a zero or negative dimension', () => {
    expect(dimensionsSchema.safeParse({ ...validDimensions, heightM: 0 }).success).toBe(false);
    expect(dimensionsSchema.safeParse({ ...validDimensions, heightM: -1 }).success).toBe(false);
  });
});

describe('createVehicleProfileRequestSchema', () => {
  it('requires name and dimensions — no driverId field (M4.2: comes from the access token)', () => {
    const result = createVehicleProfileRequestSchema.safeParse({
      name: 'Big Wagon',
      dimensions: validDimensions,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = createVehicleProfileRequestSchema.safeParse({
      dimensions: validDimensions,
    });
    expect(result.success).toBe(false);
  });

  it('ignores an extraneous driverId field rather than requiring or rejecting it', () => {
    const result = createVehicleProfileRequestSchema.safeParse({
      driverId: 'driver-1',
      name: 'Big Wagon',
      dimensions: validDimensions,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateVehicleProfileRequestSchema', () => {
  it('accepts the same shape as create', () => {
    const result = updateVehicleProfileRequestSchema.safeParse({
      name: 'Renamed',
      dimensions: validDimensions,
    });
    expect(result.success).toBe(true);
  });
});

describe('vehicleProfileIdParamsSchema', () => {
  it('requires a well-formed UUID', () => {
    expect(vehicleProfileIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(
      vehicleProfileIdParamsSchema.safeParse({ id: '11111111-1111-4111-8111-111111111111' })
        .success,
    ).toBe(true);
  });
});

describe('vehicleProfileSchema', () => {
  it('parses a real response shape', () => {
    const result = vehicleProfileSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      driverId: 'driver-1',
      name: 'Big Wagon',
      dimensions: validDimensions,
    });
    expect(result.success).toBe(true);
  });
});

describe('geoPointSchema', () => {
  it('accepts a real lat/lon pair', () => {
    expect(geoPointSchema.safeParse({ lat: 54.9707, lon: -2.1013 }).success).toBe(true);
  });

  it('rejects a missing coordinate', () => {
    expect(geoPointSchema.safeParse({ lat: 54.9707 }).success).toBe(false);
  });
});

describe('planRouteRequestSchema', () => {
  it('requires profileId, origin and destination — no driverId field', () => {
    const result = planRouteRequestSchema.safeParse({
      profileId: '11111111-1111-4111-8111-111111111111',
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing destination', () => {
    const result = planRouteRequestSchema.safeParse({
      profileId: '11111111-1111-4111-8111-111111111111',
      origin: { lat: 54.9707, lon: -2.1013 },
    });
    expect(result.success).toBe(false);
  });
});

describe('routePlanSchema', () => {
  it('parses a real response shape, including empty avoidedRestrictions/hazardsOnRoute', () => {
    const result = routePlanSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      driverId: 'driver-1',
      profileId: '22222222-2222-4222-8222-222222222222',
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
      geometry: 'encoded-polyline',
      distanceKm: 8.038,
      durationMin: 7.9,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: '2026-06-15T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('parses a non-empty avoidedRestrictions entry', () => {
    const result = routePlanSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      driverId: 'driver-1',
      profileId: '22222222-2222-4222-8222-222222222222',
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
      geometry: 'encoded-polyline',
      distanceKm: 8.038,
      durationMin: 7.9,
      avoidedRestrictions: [{ description: 'Avoided Styford Bridge — 3.7m limit' }],
      hazardsOnRoute: ['hazard-1'],
      createdAt: '2026-06-15T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
