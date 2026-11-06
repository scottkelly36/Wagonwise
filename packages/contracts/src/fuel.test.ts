import { describe, expect, it } from 'vitest';
import {
  findNearbyFuelResponseSchema,
  MAX_UNPRICED_FUEL_STATIONS,
  unpricedFuelStationSchema,
} from './fuel.js';

const station = {
  id: 'esso',
  name: 'Esso Hexham',
  location: { lat: 54.97, lon: -2.1 },
  isMotorway: false,
  isSupermarket: false,
  amenities: [],
  distanceM: 700,
};

describe('findNearbyFuelResponseSchema', () => {
  it('reads an answer from a server that has no withoutPrice, as an empty list', () => {
    const parsed = findNearbyFuelResponseSchema.parse({ fuelType: 'B7_STANDARD', stations: [] });
    expect(parsed.withoutPrice).toEqual([]);
  });

  it('reads nearby stations with no price, and drops a price field if one is sent', () => {
    const parsed = findNearbyFuelResponseSchema.parse({
      fuelType: 'B7_STANDARD',
      stations: [],
      withoutPrice: [{ ...station, pencePerLitre: 190 }],
    });
    expect(parsed.withoutPrice).toEqual([station]);
  });

  it('allows at most ten unpriced stations to be planned for', () => {
    expect(MAX_UNPRICED_FUEL_STATIONS).toBe(10);
  });
});

describe('unpricedFuelStationSchema', () => {
  it('needs the station fields but no price or date', () => {
    expect(unpricedFuelStationSchema.safeParse(station).success).toBe(true);
    expect(unpricedFuelStationSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});
