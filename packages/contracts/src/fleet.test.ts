import { describe, expect, it } from 'vitest';
import {
  createFleetVehicleRequestSchema,
  fleetVehicleSchema,
  updateFleetVehicleRequestSchema,
} from './fleet.js';

const validDimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

describe('createFleetVehicleRequestSchema', () => {
  it('requires companyId, name and dimensions, no id field', () => {
    const result = createFleetVehicleRequestSchema.safeParse({
      companyId: 'company-1',
      name: 'Big Wagon',
      dimensions: validDimensions,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(
      createFleetVehicleRequestSchema.safeParse({
        companyId: 'company-1',
        name: '',
        dimensions: validDimensions,
      }).success,
    ).toBe(false);
  });
});

describe('updateFleetVehicleRequestSchema', () => {
  it('accepts the same dimensions shape as create, no companyId field', () => {
    expect(
      updateFleetVehicleRequestSchema.safeParse({ name: 'Renamed', dimensions: validDimensions })
        .success,
    ).toBe(true);
  });
});

describe('fleetVehicleSchema', () => {
  it('parses a real response shape', () => {
    const result = fleetVehicleSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: 'company-1',
      name: 'Big Wagon',
      dimensions: validDimensions,
    });
    expect(result.success).toBe(true);
  });
});
