import { safeParkingSpotIdSchema } from '@wagonwise/contracts/parking';

import { ApiError } from './errors';
import { findNearbySafeParkingSpots, reportSafeParkingSpot } from './parking';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const spot = {
  id: '11111111-1111-1111-1111-111111111111',
  reporterId: '22222222-2222-2222-2222-222222222222',
  location: { lat: 54.9707, lon: -2.1013 },
  note: 'flat layby, room for a 44-tonner',
  reportedAt: '2026-06-15T08:00:00.000Z',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('reportSafeParkingSpot', () => {
  it('posts the id/location/note, parsing the 200 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, spot));
    globalThis.fetch = fetchMock;

    const result = await reportSafeParkingSpot('token-1', {
      id: safeParkingSpotIdSchema.parse(spot.id),
      location: spot.location,
      note: spot.note,
    });

    expect(result).toEqual(spot);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/parking\/spots$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({
      id: spot.id,
      location: spot.location,
      note: spot.note,
    });
  });

  it('throws an ApiError when the server rejects the request with a 400', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { tag: 'InvalidNote', reason: 'too_long', requestId: 'r1' }),
      );

    await expect(
      reportSafeParkingSpot('token-1', {
        id: safeParkingSpotIdSchema.parse(spot.id),
        location: spot.location,
        note: spot.note,
      }),
    ).rejects.toMatchObject({ tag: 'InvalidNote', status: 400 });
  });
});

describe('findNearbySafeParkingSpots', () => {
  it('posts the corridor and radius, parsing the spots array out of the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { spots: [spot] }));
    globalThis.fetch = fetchMock;

    const result = await findNearbySafeParkingSpots('token-1', {
      corridor: [spot.location],
      radiusM: 5000,
    });

    expect(result).toEqual([spot]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/parking\/spots\/nearby$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({
      corridor: [spot.location],
      radiusM: 5000,
    });
  });

  it('throws an ApiError on a non-200 response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'invalid_request' }));

    await expect(
      findNearbySafeParkingSpots('token-1', { corridor: [spot.location], radiusM: 5000 }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
