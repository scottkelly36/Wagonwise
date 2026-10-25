import { ApiError } from './errors';
import { locationToWords, wordsToLocation } from './what3words';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const address = {
  words: 'filled.count.soap',
  location: { lat: 51.52, lon: -0.2 },
  nearestPlace: 'Bayswater, London',
  country: 'GB',
};

describe('what3words', () => {
  it('turns three words into a spot, posting them as typed', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, address));
    globalThis.fetch = fetchMock;
    expect(await wordsToLocation('token-1', '///Filled Count Soap')).toEqual(address);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toMatch(/\/what3words\/to-location$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ words: '///Filled Count Soap' });
  });

  it('turns a position into its three words', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, address));
    globalThis.fetch = fetchMock;
    expect((await locationToWords('token-1', { lat: 51.52, lon: -0.2 })).words).toBe(
      'filled.count.soap',
    );
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/what3words\/to-words$/);
  });

  it.each([
    [400, 'InvalidWords'],
    [404, 'WordsNotFound'],
    [503, 'LookupUnavailable'],
  ])('throws an ApiError with the tag when core answers %i', async (status, tag) => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(status, { tag, requestId: 'r1' }));
    await expect(wordsToLocation('token-1', 'a.b.c')).rejects.toMatchObject({ tag, status });
    await expect(wordsToLocation('token-1', 'a.b.c')).rejects.toBeInstanceOf(ApiError);
  });
});
