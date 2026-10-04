import { vehicleProfileIdSchema } from '@wagonwise/contracts/routing';

import {
  createVehicleProfile,
  deleteVehicleProfile,
  endTrip,
  getRoutePlan,
  getVehicleProfile,
  listVehicleProfiles,
  planRoute,
  previewRouteOptions,
  startTrip,
  updateVehicleProfile,
} from './routing';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function noBodyResponse(status: number): Response {
  return {
    status,
    headers: { get: (name: string) => (name === 'content-length' ? '0' : null) },
    json: () => Promise.reject(new Error('should not be called')),
  } as unknown as Response;
}

const profile = {
  id: '11111111-1111-1111-1111-111111111111',
  driverId: '22222222-2222-2222-2222-222222222222',
  name: 'Big rig',
  dimensions: { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 },
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('listVehicleProfiles', () => {
  it('sends the bearer token and parses the array response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, [profile]));
    globalThis.fetch = fetchMock;

    const result = await listVehicleProfiles('token-1');

    expect(result).toEqual([profile]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/routing\/vehicle-profiles$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });
});

describe('getVehicleProfile', () => {
  it('requests the specific id and parses one profile', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, profile));
    globalThis.fetch = fetchMock;

    const result = await getVehicleProfile('token-1', profile.id);

    expect(result).toEqual(profile);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(new RegExp(`/routing/vehicle-profiles/${profile.id}$`));
  });

  it("throws an ApiError on a 404 (someone else's profile, or a deleted one)", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { tag: 'VehicleProfileNotFound', requestId: 'r1' }));

    await expect(getVehicleProfile('token-1', profile.id)).rejects.toMatchObject({
      tag: 'VehicleProfileNotFound',
      status: 404,
    });
  });
});

describe('createVehicleProfile', () => {
  it('posts the name and dimensions, parsing the 201 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, profile));
    globalThis.fetch = fetchMock;

    const result = await createVehicleProfile('token-1', {
      name: profile.name,
      dimensions: profile.dimensions,
    });

    expect(result).toEqual(profile);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      name: profile.name,
      dimensions: profile.dimensions,
    });
  });

  it('throws an ApiError carrying the tag on invalid dimensions', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        tag: 'InvalidDimensions',
        reason: 'must_be_positive',
        requestId: 'r1',
      }),
    );

    await expect(
      createVehicleProfile('token-1', { name: 'x', dimensions: profile.dimensions }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('updateVehicleProfile', () => {
  it('puts to the profile id and parses the 200 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, profile));
    globalThis.fetch = fetchMock;

    await updateVehicleProfile('token-1', profile.id, {
      name: profile.name,
      dimensions: profile.dimensions,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/routing/vehicle-profiles/${profile.id}$`));
    expect(init.method).toBe('PUT');
  });
});

describe('deleteVehicleProfile', () => {
  it('sends a DELETE and resolves on a 204 with no body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(noBodyResponse(204));
    globalThis.fetch = fetchMock;

    await expect(deleteVehicleProfile('token-1', profile.id)).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
  });
});

describe('planRoute', () => {
  const routePlan = {
    id: '33333333-3333-3333-3333-333333333333',
    driverId: profile.driverId,
    profileId: vehicleProfileIdSchema.parse(profile.id),
    origin: { lat: 54.971, lon: -2.1 },
    destination: { lat: 54.973, lon: -2.017 },
    geometry: 'encoded-polyline',
    distanceKm: 8.038,
    durationMin: 12.5,
    avoidedRestrictions: [],
    hazardsOnRoute: [],
    maneuvers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('posts the profile and points, parsing the 201 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, routePlan));
    globalThis.fetch = fetchMock;

    const result = await planRoute('token-1', {
      profileId: vehicleProfileIdSchema.parse(profile.id),
      origin: routePlan.origin,
      destination: routePlan.destination,
    });

    expect(result).toEqual(routePlan);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/routing\/route-plans$/);
    expect(JSON.parse(init.body as string)).toEqual({
      profileId: vehicleProfileIdSchema.parse(profile.id),
      origin: routePlan.origin,
      destination: routePlan.destination,
    });
  });

  it('throws an ApiError with a 422 when the vehicle genuinely cannot get there', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(422, { tag: 'NoRouteFound', requestId: 'r1' }));

    await expect(
      planRoute('token-1', {
        profileId: vehicleProfileIdSchema.parse(profile.id),
        origin: routePlan.origin,
        destination: routePlan.destination,
      }),
    ).rejects.toMatchObject({ tag: 'NoRouteFound', status: 422 });
  });
});

describe('previewRouteOptions', () => {
  const options = [
    { geometry: 'fast-geometry', distanceKm: 120, durationMin: 90, labels: ['fastest'] },
    { geometry: 'short-geometry', distanceKm: 80, durationMin: 110, labels: ['shortest'] },
  ];

  it('posts the profile and points, parsing the options array out of the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { options }));
    globalThis.fetch = fetchMock;

    const result = await previewRouteOptions('token-1', {
      profileId: vehicleProfileIdSchema.parse(profile.id),
      origin: { lat: 54.971, lon: -2.1 },
      destination: { lat: 54.973, lon: -2.017 },
    });

    expect(result).toEqual(options);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/routing\/route-options\/preview$/);
  });

  it('throws an ApiError on a non-200 response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'invalid_request' }));

    await expect(
      previewRouteOptions('token-1', {
        profileId: vehicleProfileIdSchema.parse(profile.id),
        origin: { lat: 54.971, lon: -2.1 },
        destination: { lat: 54.973, lon: -2.017 },
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('getRoutePlan', () => {
  const routePlan = {
    id: '33333333-3333-3333-3333-333333333333',
    driverId: profile.driverId,
    profileId: vehicleProfileIdSchema.parse(profile.id),
    origin: { lat: 54.971, lon: -2.1 },
    destination: { lat: 54.973, lon: -2.017 },
    geometry: 'encoded-polyline',
    distanceKm: 6.2,
    durationMin: 9,
    avoidedRestrictions: [],
    hazardsOnRoute: ['hazard-1'],
    maneuvers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('requests the specific id and parses the plan', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, routePlan));
    globalThis.fetch = fetchMock;

    const result = await getRoutePlan('token-1', routePlan.id);

    expect(result).toEqual(routePlan);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(new RegExp(`/routing/route-plans/${routePlan.id}$`));
  });

  it("throws an ApiError on a 404 (someone else's plan, or a stale one)", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { tag: 'RoutePlanNotFound', requestId: 'r1' }));

    await expect(getRoutePlan('token-1', routePlan.id)).rejects.toMatchObject({
      tag: 'RoutePlanNotFound',
      status: 404,
    });
  });
});

describe('startTrip', () => {
  const activeTrip = {
    id: '44444444-4444-4444-4444-444444444444',
    routePlanId: '33333333-3333-3333-3333-333333333333',
    driverId: profile.driverId,
    startedAt: '2026-06-15T08:00:00.000Z',
  };

  it('posts to the route plan’s trip endpoint with no body, parsing the 201 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, activeTrip));
    globalThis.fetch = fetchMock;

    const result = await startTrip('token-1', activeTrip.routePlanId);

    expect(result).toEqual(activeTrip);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/routing/route-plans/${activeTrip.routePlanId}/trip$`));
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });

  it('throws an ApiError with a 409 when a trip is already active', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(409, { tag: 'TripAlreadyActive', requestId: 'r1' }));

    await expect(startTrip('token-1', activeTrip.routePlanId)).rejects.toMatchObject({
      tag: 'TripAlreadyActive',
      status: 409,
    });
  });
});

describe('endTrip', () => {
  const endedTrip = {
    id: '44444444-4444-4444-4444-444444444444',
    routePlanId: '33333333-3333-3333-3333-333333333333',
    driverId: profile.driverId,
    startedAt: '2026-06-15T08:00:00.000Z',
    endedAt: '2026-06-15T09:00:00.000Z',
  };

  it('posts to the trip’s end endpoint with no body, parsing the 200 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, endedTrip));
    globalThis.fetch = fetchMock;

    const result = await endTrip('token-1', endedTrip.id);

    expect(result).toEqual(endedTrip);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(new RegExp(`/routing/trips/${endedTrip.id}/end$`));
  });

  it("throws an ApiError on a 404 (someone else's trip, or an unknown id)", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { tag: 'ActiveTripNotFound', requestId: 'r1' }));

    await expect(endTrip('token-1', endedTrip.id)).rejects.toMatchObject({
      tag: 'ActiveTripNotFound',
      status: 404,
    });
  });
});
