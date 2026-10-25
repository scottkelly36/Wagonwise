import { cancelSos, raiseSos } from './sos';

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

const REQUEST = '33333333-3333-4333-8333-333333333333';
const ACME = '11111111-1111-4111-8111-111111111111';

describe('sos', () => {
  it('raises SOS with the request id and position, and reads the words and who was told', async () => {
    const reply = {
      requestId: REQUEST,
      location: { lat: 54.97, lon: -2.1 },
      words: 'filled.count.soap',
      nearestPlace: 'Hexham',
      notified: [{ companyId: ACME, name: 'Acme Haulage' }],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, reply));
    globalThis.fetch = fetchMock;
    const sent = await raiseSos('token-1', {
      requestId: REQUEST,
      location: { lat: 54.97, lon: -2.1 },
    });
    expect(sent.words).toBe('filled.count.soap');
    expect(sent.notified[0]?.name).toBe('Acme Haulage');
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toMatch(/\/sos\/raise$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      requestId: REQUEST,
      location: { lat: 54.97, lon: -2.1 },
    });
  });

  it('reads an answer with no words and nobody told', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        requestId: REQUEST,
        location: { lat: 54.97, lon: -2.1 },
        notified: [],
      }),
    );
    const sent = await raiseSos('token-1', {
      requestId: REQUEST,
      location: { lat: 54.97, lon: -2.1 },
    });
    expect(sent.words).toBeUndefined();
    expect(sent.notified).toEqual([]);
  });

  it('throws when core refuses', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: 'unauthenticated', requestId: 'r' }));
    await expect(
      raiseSos('token-1', { requestId: REQUEST, location: { lat: 54.97, lon: -2.1 } }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('cancels with the request id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(noBodyResponse(204));
    globalThis.fetch = fetchMock;
    await cancelSos('token-1', REQUEST);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toMatch(/\/sos\/cancel$/);
    expect(JSON.parse(init.body)).toEqual({ requestId: REQUEST });
  });
});
