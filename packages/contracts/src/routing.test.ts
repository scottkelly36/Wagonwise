import { describe, expect, it } from 'vitest';
import {
  createVehicleProfileRequestSchema,
  dimensionsSchema,
  driverIdQuerySchema,
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
  it('requires driverId, name and dimensions', () => {
    const result = createVehicleProfileRequestSchema.safeParse({
      driverId: 'driver-1',
      name: 'Big Wagon',
      dimensions: validDimensions,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = createVehicleProfileRequestSchema.safeParse({
      driverId: 'driver-1',
      dimensions: validDimensions,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateVehicleProfileRequestSchema', () => {
  it('accepts the same shape as create', () => {
    const result = updateVehicleProfileRequestSchema.safeParse({
      driverId: 'driver-1',
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

describe('driverIdQuerySchema', () => {
  it('requires a non-empty driverId', () => {
    expect(driverIdQuerySchema.safeParse({ driverId: '' }).success).toBe(false);
    expect(driverIdQuerySchema.safeParse({ driverId: 'driver-1' }).success).toBe(true);
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
