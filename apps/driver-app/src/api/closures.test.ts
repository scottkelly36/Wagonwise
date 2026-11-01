import { findNearbyClosures } from './closures';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const answer = {
  refreshedAt: '2026-11-01T19:55:00.000Z',
  closures: [
    {
      id: 'rec-1',
      kind: 'full',
      status: 'active',
      road: 'M42',
      direction: 'northBound',
      description: 'M42 northbound Jct 6 to Jct 9 carriageway closure',
      cause: 'maintenanceWork',
      startsAt: '2026-10-30T20:48:00.000Z',
      endsAt: '2026-11-02T06:00:00.000Z',
      lanesClosed: 0,
      location: { lat: 52.479, lon: -1.711 },
      distanceM: 34,
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
  ],
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('findNearbyClosures', () => {
  it('posts the request with the token and parses the answer', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, answer));
    globalThis.fetch = fetchMock;

    const result = await findNearbyClosures('token-1', {
      centre: { lat: 52.479, lon: -1.711 },
      radiusM: 20_000,
      withinDays: 7,
      limit: 50,
    });

    expect(result).toEqual(answer);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/closures\/nearby$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toMatchObject({ radiusM: 20_000, withinDays: 7 });
  });

  it('refuses an answer that does not match the contract', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { closures: [{ id: 'x', kind: 'whole-road' }] }));
    await expect(
      findNearbyClosures('token-1', { centre: { lat: 1, lon: 1 }, radiusM: 1000 }),
    ).rejects.toThrow();
  });

  it('throws an ApiError for a failed request', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthenticated' }));
    await expect(
      findNearbyClosures('bad', { centre: { lat: 1, lon: 1 }, radiusM: 1000 }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
