import { findNearbyCameras } from './cameras';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('findNearbyCameras', () => {
  it('sends the point and radius and returns the cameras', async () => {
    const cameras = [
      { id: 'c1', location: { lat: 54.97, lon: -2.1 }, kind: 'fixed', maxspeedMph: 40 },
      { id: 'c2', location: { lat: 54.98, lon: -2.09 }, kind: 'red_light' },
    ];
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { cameras }));
    globalThis.fetch = fetchMock;

    const found = await findNearbyCameras('token-1', {
      corridor: [{ lat: 54.97, lon: -2.1 }],
      radiusM: 5000,
    });

    expect(found).toEqual(cameras);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toMatch(/\/cameras\/nearby$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      corridor: [{ lat: 54.97, lon: -2.1 }],
      radiusM: 5000,
    });
  });

  it('throws an ApiError when core refuses', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'unauthenticated', requestId: 'r1' }));
    await expect(
      findNearbyCameras('token-1', { corridor: [{ lat: 54.97, lon: -2.1 }], radiusM: 5000 }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
