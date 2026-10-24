import { nearbyPublicPlaces, reportPlace, setPlaceVisibility } from './places';

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
    json: () => Promise.reject(new Error('no body')),
  } as unknown as Response;
}

const ID = '33333333-3333-4333-8333-333333333333';
const place = {
  id: ID,
  category: 'farm',
  name: 'Smith’s Farm',
  note: 'Gate on the left',
  location: { lat: 54.95, lon: -2.2 },
  isPublic: true,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
};

describe('public places', () => {
  it('asks for the public places near a point', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { places: [place] }));
    globalThis.fetch = fetchMock;
    const found = await nearbyPublicPlaces('token-1', {
      location: { lat: 54.95, lon: -2.2 },
      radiusM: 5000,
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.isPublic).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toMatch(/\/places\/public\/nearby$/);
    expect(init.method).toBe('POST');
  });

  it('treats a place from an older reply, with no isPublic, as private', async () => {
    const { isPublic: _omitted, ...old } = place;
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { places: [old] }));
    const found = await nearbyPublicPlaces('token-1', { location: place.location, radiusM: 1000 });
    expect(found[0]?.isPublic).toBe(false);
  });

  it('sets a place public or private', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, place));
    globalThis.fetch = fetchMock;
    const updated = await setPlaceVisibility('token-1', ID, true);
    expect(updated.isPublic).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toMatch(new RegExp(`/places/${ID}/visibility$`));
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ isPublic: true });
  });

  it('reports a place with a reason, and a refusal throws', async () => {
    const fetchMock = jest.fn().mockResolvedValue(noBodyResponse(204));
    globalThis.fetch = fetchMock;
    await reportPlace('token-1', ID, 'private_property');
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toMatch(new RegExp(`/places/${ID}/report$`));
    expect(JSON.parse(init.body)).toEqual({ reason: 'private_property' });

    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(403, { tag: 'Forbidden', requestId: 'r1' }));
    await expect(reportPlace('token-1', ID, 'other')).rejects.toMatchObject({ status: 403 });
  });
});
