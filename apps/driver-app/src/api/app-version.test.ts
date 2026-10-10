import { getAppVersionInfo } from './app-version';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('getAppVersionInfo', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('asks without signing in and reads what is set', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { latestVersion: '1.3.0', updateUrl: 'https://store.example/app' }),
      );
    globalThis.fetch = fetchMock;
    await expect(getAppVersionInfo()).resolves.toEqual({
      latestVersion: '1.3.0',
      updateUrl: 'https://store.example/app',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/app\/version$/);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({});
  });

  it('reads an empty answer as nothing to say', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    await expect(getAppVersionInfo()).resolves.toEqual({});
  });

  it('fails on a server error so the app says nothing rather than guess', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(503, { tag: 'Unavailable' }));
    await expect(getAppVersionInfo()).rejects.toBeInstanceOf(ApiError);
  });
});
