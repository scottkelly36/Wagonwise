import { describe, expect, it } from 'vitest';
import {
  activeTripIdParamsSchema,
  activeTripSchema,
  createVehicleProfileRequestSchema,
  dimensionsSchema,
  fasterRouteCheckRequestSchema,
  fasterRouteCheckResponseSchema,
  geoPointSchema,
  planRouteRequestSchema,
  previewRouteOptionsRequestSchema,
  lowEmissionZonesResponseSchema,
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

  it('accepts a top speed from 30 to 130 km/h, and none', () => {
    expect(dimensionsSchema.safeParse({ ...validDimensions, topSpeedKph: 90 }).success).toBe(true);
    expect(dimensionsSchema.safeParse({ ...validDimensions, topSpeedKph: 30 }).success).toBe(true);
    expect(dimensionsSchema.safeParse({ ...validDimensions, topSpeedKph: 130 }).success).toBe(true);
  });

  it('rejects a top speed that is a typo', () => {
    expect(dimensionsSchema.safeParse({ ...validDimensions, topSpeedKph: 0 }).success).toBe(false);
    expect(dimensionsSchema.safeParse({ ...validDimensions, topSpeedKph: 29 }).success).toBe(false);
    expect(dimensionsSchema.safeParse({ ...validDimensions, topSpeedKph: 200 }).success).toBe(
      false,
    );
  });

  it('accepts Euro VI yes, no, or not stated, and nothing else', () => {
    expect(dimensionsSchema.safeParse({ ...validDimensions, euroVI: true }).success).toBe(true);
    expect(dimensionsSchema.safeParse({ ...validDimensions, euroVI: false }).success).toBe(true);
    expect(dimensionsSchema.safeParse(validDimensions).success).toBe(true);
    expect(dimensionsSchema.safeParse({ ...validDimensions, euroVI: 'yes' }).success).toBe(false);
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

  it('accepts an optional heading from 0 to 360 degrees, rejects anything outside it', () => {
    const base = {
      profileId: '11111111-1111-4111-8111-111111111111',
      origin: { lat: 54.9707, lon: -2.1013 },
      destination: { lat: 54.9738, lon: -2.0165 },
    };
    expect(planRouteRequestSchema.safeParse(base).success).toBe(true);
    expect(planRouteRequestSchema.safeParse({ ...base, originHeadingDeg: 0 }).success).toBe(true);
    expect(planRouteRequestSchema.safeParse({ ...base, originHeadingDeg: 215.5 }).success).toBe(
      true,
    );
    expect(planRouteRequestSchema.safeParse({ ...base, originHeadingDeg: -1 }).success).toBe(false);
    expect(planRouteRequestSchema.safeParse({ ...base, originHeadingDeg: 361 }).success).toBe(
      false,
    );
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

describe('lowEmissionZonesResponseSchema', () => {
  const zone = {
    id: 'glasgow',
    name: 'Glasgow Low Emission Zone',
    kind: 'penalty',
    penaltyGBP: 60,
    enforcedFrom: '2023-06-01',
    rings: [
      [
        [55.85, -4.26],
        [55.85, -4.25],
        [55.86, -4.25],
      ],
    ],
  };

  it('carries zones as outlines of latitude and longitude pairs, with the licence credit', () => {
    expect(
      lowEmissionZonesResponseSchema.safeParse({ zones: [zone], attribution: 'credit' }).success,
    ).toBe(true);
  });

  it('carries an English zone with a daily charge in place of a penalty', () => {
    const english = {
      id: 'london',
      name: 'London Low Emission Zone',
      kind: 'daily',
      dailyChargeGBP: { lowGBP: 100, highGBP: 300 },
      enforcedFrom: '2008-02-04',
      rings: zone.rings,
    };
    expect(
      lowEmissionZonesResponseSchema.safeParse({ zones: [english], attribution: 'credit' }).success,
    ).toBe(true);
  });

  it('needs the credit, and pairs rather than longer points', () => {
    expect(lowEmissionZonesResponseSchema.safeParse({ zones: [zone] }).success).toBe(false);
    expect(
      lowEmissionZonesResponseSchema.safeParse({
        zones: [{ ...zone, rings: [[[55.85, -4.26, 10]]] }],
        attribution: 'credit',
      }).success,
    ).toBe(false);
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

  it('carries low emission zones with a status and the penalty, and treats them as optional', () => {
    const base = { geometry: 'g', distanceKm: 80, durationMin: 110, labels: ['fastest'] };
    expect(
      routeOptionSchema.safeParse({
        ...base,
        zones: [
          { name: 'Glasgow Low Emission Zone', status: 'charged', penaltyGBP: 60 },
          { name: 'Edinburgh Low Emission Zone', status: 'may-be-charged', penaltyGBP: 60 },
        ],
      }).success,
    ).toBe(true);
    expect(routeOptionSchema.safeParse(base).success).toBe(true);
    expect(
      routeOptionSchema.safeParse({
        ...base,
        zones: [{ name: 'Glasgow Low Emission Zone', status: 'fine', penaltyGBP: 60 }],
      }).success,
    ).toBe(false);
  });

  it('carries a zone with a daily charge, and an older server’s zone with only a penalty and no kind', () => {
    const base = { geometry: 'g', distanceKm: 80, durationMin: 110, labels: ['fastest'] };
    expect(
      routeOptionSchema.safeParse({
        ...base,
        zones: [
          {
            name: 'London Low Emission Zone',
            status: 'may-be-charged',
            kind: 'daily',
            dailyChargeGBP: { lowGBP: 100, highGBP: 300 },
          },
          { name: 'Glasgow Low Emission Zone', status: 'charged', penaltyGBP: 60 },
        ],
      }).success,
    ).toBe(true);
  });

  it('carries named tolls with an optional price, note and when to pay', () => {
    const base = { geometry: 'g', distanceKm: 80, durationMin: 110, labels: ['fastest'] };
    expect(
      routeOptionSchema.safeParse({
        ...base,
        charges: [
          { name: 'Dartford Crossing', lowGBP: 4.2, highGBP: 8.4, note: 'n', payBy: 'p' },
          { name: 'Humber Bridge' },
        ],
      }).success,
    ).toBe(true);
    // Absent for an older server, and an empty list is fine too.
    expect(routeOptionSchema.safeParse(base).success).toBe(true);
    expect(routeOptionSchema.safeParse({ ...base, charges: [] }).success).toBe(true);
    // A toll with no name is not a toll the app can show.
    expect(routeOptionSchema.safeParse({ ...base, charges: [{ lowGBP: 4.2 }] }).success).toBe(
      false,
    );
  });
});

describe('routePlanSchema', () => {
  const basePlan = {
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
  };

  it('treats a plan with no maneuvers (made before spoken directions) as having none', () => {
    const result = routePlanSchema.parse(basePlan);
    expect(result.maneuvers).toEqual([]);
  });

  it('parses turn-by-turn steps, with a roundabout exit', () => {
    const result = routePlanSchema.parse({
      ...basePlan,
      maneuvers: [
        {
          kind: 'roundabout',
          text: 'Enter the roundabout and take the 3rd exit onto A6079.',
          speech: 'Enter the roundabout and take the 3rd exit onto A6079.',
          streetNames: ['A6079'],
          lengthM: 23,
          beginShapeIndex: 87,
          roundaboutExit: 3,
        },
      ],
    });
    expect(result.maneuvers[0]?.roundaboutExit).toBe(3);
  });

  it('refuses a step of a kind it does not know, rather than guessing an arrow for it', () => {
    const result = routePlanSchema.safeParse({
      ...basePlan,
      maneuvers: [
        {
          kind: 'teleport',
          text: 'x',
          speech: 'x',
          streetNames: [],
          lengthM: 1,
          beginShapeIndex: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

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

describe('faster-route check', () => {
  it('takes a position, and defaults the kept offers to none', () => {
    const result = fasterRouteCheckRequestSchema.safeParse({ position: { lat: 55, lon: -2 } });
    expect(result.success && result.data.keptKeys).toEqual([]);
    expect(fasterRouteCheckRequestSchema.safeParse({ position: 'here' }).success).toBe(false);
  });

  it('can say the driver chose a route for having no toll, and that an offer has one', () => {
    const request = fasterRouteCheckRequestSchema.safeParse({
      position: { lat: 55, lon: -2 },
      avoidTolls: true,
    });
    expect(request.success && request.data.avoidTolls).toBe(true);
    const response = fasterRouteCheckResponseSchema.safeParse({
      offer: {
        routePlanId: '22222222-2222-4222-8222-222222222222',
        key: 'abc12345',
        savingMinutes: 8,
        currentMinutes: 60,
        alternativeMinutes: 52,
        hasToll: true,
      },
    });
    expect(response.success && response.data.offer?.hasToll).toBe(true);
  });

  it('answers with an offer or null', () => {
    expect(fasterRouteCheckResponseSchema.safeParse({ offer: null }).success).toBe(true);
    expect(
      fasterRouteCheckResponseSchema.safeParse({
        offer: {
          routePlanId: '22222222-2222-4222-8222-222222222222',
          key: 'abc12345',
          savingMinutes: 8,
          currentMinutes: 60,
          alternativeMinutes: 52,
        },
      }).success,
    ).toBe(true);
  });
});
