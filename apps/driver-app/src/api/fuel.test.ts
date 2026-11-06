import { ApiError } from './errors';
import { findNearbyFuel } from './fuel';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const answer = {
  fuelType: 'B7_STANDARD',
  refreshedAt: '2026-10-29T11:00:00.000Z',
  stations: [
    {
      id: 'a',
      name: 'Station A',
      location: { lat: 54.97, lon: -2.1 },
      isMotorway: false,
      isSupermarket: true,
      amenities: [],
      pencePerLitre: 189.9,
      priceUpdatedAt: '2026-10-29T08:00:00.000Z',
      distanceM: 800,
    },
  ],
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('findNearbyFuel', () => {
  it('posts the request with the token and parses the answer', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, answer));
    globalThis.fetch = fetchMock;

    const result = await findNearbyFuel('token-1', {
      centre: { lat: 54.97, lon: -2.1 },
      radiusM: 20_000,
      fuelType: 'B7_STANDARD',
      maxAgeDays: 7,
      limit: 20,
    });

    // An answer from a server that predates `withoutPrice` still parses, with an empty list.
    expect(result).toEqual({ ...answer, withoutPrice: [] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/fuel\/nearby$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toMatchObject({ radiusM: 20_000, maxAgeDays: 7 });
  });

  it('reads the nearby stations that have no usable price', async () => {
    const withoutPrice = [
      {
        id: 'esso',
        name: 'Esso Hexham',
        brand: 'ESSO',
        location: { lat: 54.96, lon: -2.09 },
        isMotorway: false,
        isSupermarket: false,
        amenities: [],
        distanceM: 700,
      },
    ];
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { ...answer, withoutPrice }));
    const result = await findNearbyFuel('token-1', {
      centre: { lat: 54.97, lon: -2.1 },
      radiusM: 20_000,
    });
    expect(result.withoutPrice).toEqual(withoutPrice);
  });

  it('throws an ApiError on a failure status', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' }));
    await expect(
      findNearbyFuel('token-1', { centre: { lat: 54.97, lon: -2.1 }, radiusM: 1000 }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
