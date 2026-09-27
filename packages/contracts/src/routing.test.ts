import { describe, expect, it } from 'vitest';
import {
  activeTripIdParamsSchema,
  activeTripSchema,
  createVehicleProfileRequestSchema,
  dimensionsSchema,
  geoPointSchema,
  planRouteRequestSchema,
  previewRouteOptionsRequestSchema,
  routeOptionSchema,
  routePlanIdParamsSchema,
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

describe('fuelConsumptionL100km (M9)', () => {
  it('is optional and accepted on create/update/vehicleProfileSchema', () => {
    expect(
      createVehicleProfileRequestSchema.safeParse({
        name: 'Big Wagon',
        dimensions: validDimensions,
        fuelConsumptionL100km: 30,
      }).success,
    ).toBe(true);
    expect(
      updateVehicleProfileRequestSchema.safeParse({
        name: 'Big Wagon',
        dimensions: validDimensions,
      }).success,
    ).toBe(true);
    expect(
      vehicleProfileSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        driverId: 'driver-1',
        name: 'Big Wagon',
        dimensions: validDimensions,
        fuelConsumptionL100km: 30,
      }).success,
    ).toBe(true);
  });

  it('rejects a non-positive value', () => {
    expect(
      createVehicleProfileRequestSchema.safeParse({
        name: 'Big Wagon',
        dimensions: validDimensions,
        fuelConsumptionL100km: 0,
      }).success,
    ).toBe(false);
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

  it('accepts an optional strategy of fastest or shortest, rejects anything else', () => {
    const base = {
      profileId: '11111111-1111-4111-8111-111111111111',
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
    };
    expect(planRouteRequestSchema.safeParse({ ...base, strategy: 'fastest' }).success).toBe(true);
    expect(planRouteRequestSchema.safeParse({ ...base, strategy: 'shortest' }).success).toBe(true);
    expect(planRouteRequestSchema.safeParse({ ...base, strategy: 'cheapest' }).success).toBe(false);
  });
});

describe('previewRouteOptionsRequestSchema', () => {
  it('requires profileId, origin and destination, same shape as planRouteRequestSchema minus strategy', () => {
    const result = previewRouteOptionsRequestSchema.safeParse({
      profileId: '11111111-1111-4111-8111-111111111111',
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
    });
    expect(result.success).toBe(true);
  });
});

describe('routeOptionSchema', () => {
  it('requires a non-empty labels array', () => {
    expect(
      routeOptionSchema.safeParse({
        geometry: 'encoded-polyline',
        distanceKm: 80,
        durationMin: 110,
        labels: [],
      }).success,
    ).toBe(false);
    expect(
      routeOptionSchema.safeParse({
        geometry: 'encoded-polyline',
        distanceKm: 80,
        durationMin: 110,
        labels: ['fastest', 'shortest'],
      }).success,
    ).toBe(true);
  });

  it('estimatedFuelCostGBP is optional', () => {
    expect(
      routeOptionSchema.safeParse({
        geometry: 'encoded-polyline',
        distanceKm: 80,
        durationMin: 110,
        labels: ['fastest'],
      }).success,
    ).toBe(true);
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

  it('accepts an optional estimatedFuelCostGBP', () => {
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
      estimatedFuelCostGBP: 12.5,
    });
    expect(result.success).toBe(true);
  });
});

describe('routePlanIdParamsSchema', () => {
  it('requires a well-formed UUID', () => {
    expect(routePlanIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(
      routePlanIdParamsSchema.safeParse({ id: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
  });
});

describe('activeTripIdParamsSchema', () => {
  it('requires a well-formed UUID', () => {
    expect(activeTripIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(
      activeTripIdParamsSchema.safeParse({ id: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
  });
});

describe('activeTripSchema', () => {
  it('parses a freshly started trip, with lastPosition/endedAt absent', () => {
    const result = activeTripSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      routePlanId: '22222222-2222-4222-8222-222222222222',
      driverId: 'driver-1',
      startedAt: '2026-06-15T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('parses an ended trip with lastPosition/endedAt present', () => {
    const result = activeTripSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      routePlanId: '22222222-2222-4222-8222-222222222222',
      driverId: 'driver-1',
      startedAt: '2026-06-15T08:00:00.000Z',
      lastPosition: { lat: 54.9707, lon: -2.1013 },
      endedAt: '2026-06-15T09:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
