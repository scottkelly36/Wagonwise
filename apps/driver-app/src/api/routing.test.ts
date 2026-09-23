import {
  createVehicleProfile,
  deleteVehicleProfile,
  getVehicleProfile,
  listVehicleProfiles,
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
