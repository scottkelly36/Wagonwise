import { joinWithCode, leaveLink, listMyLinks, respondToInvitation } from './fleet';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const link = {
  id: '11111111-1111-1111-1111-111111111111',
  companyId: '22222222-2222-2222-2222-222222222222',
  companyName: 'Acme Haulage',
  status: 'requested' as const,
  createdAt: '2026-10-02T09:00:00.000Z',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('listMyLinks', () => {
  it('sends the bearer token and parses the links array', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { links: [link] }));
    globalThis.fetch = fetchMock;

    const result = await listMyLinks('token-1');

    expect(result).toEqual([link]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/fleet\/links$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });
});

describe('joinWithCode', () => {
  it('posts the code and parses the created request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, link));
    globalThis.fetch = fetchMock;

    const result = await joinWithCode('token-1', 'ABCD-2345');

    expect(result).toEqual(link);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/fleet\/links\/join$/);
    expect(JSON.parse(init.body as string)).toEqual({ code: 'ABCD-2345' });
  });

  it('throws an ApiError on an unknown or malformed code', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(400, { tag: 'InvalidCode', requestId: 'r1' }));

    await expect(joinWithCode('token-1', 'NOPE')).rejects.toMatchObject({
      tag: 'InvalidCode',
      status: 400,
    });
    await expect(joinWithCode('token-1', 'NOPE')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('respondToInvitation', () => {
  it('posts the accept flag and parses the settled link', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ...link, status: 'active' }));
    globalThis.fetch = fetchMock;

    const result = await respondToInvitation('token-1', link.id, true);

    expect(result.status).toBe('active');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/fleet/links/${link.id}/respond$`));
    expect(JSON.parse(init.body as string)).toEqual({ accept: true });
  });
});

describe('leaveLink', () => {
  it('posts with no body and parses the settled link', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ...link, status: 'left' }));
    globalThis.fetch = fetchMock;

    const result = await leaveLink('token-1', link.id);

    expect(result.status).toBe('left');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/fleet/links/${link.id}/leave$`));
    expect(init.body).toBeUndefined();
  });

  it('throws an ApiError for a link that is not there (someone else’s, or already settled)', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { tag: 'LinkNotFound', requestId: 'r1' }));

    await expect(leaveLink('token-1', link.id)).rejects.toMatchObject({
      tag: 'LinkNotFound',
      status: 404,
    });
  });
});
