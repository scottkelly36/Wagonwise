import { requestOtp, verifyOtp, refreshAccessToken } from './identity';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('requestOtp', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the identifier and invite code, resolving on a 200', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    globalThis.fetch = fetchMock;

    await requestOtp('driver@example.com', 'INVITE1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/identity\/otp\/request$/);
    expect(JSON.parse(init.body as string)).toEqual({
      identifier: 'driver@example.com',
      inviteCode: 'INVITE1',
    });
  });

  it('omits inviteCode entirely when not given, rather than sending null', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    globalThis.fetch = fetchMock;

    await requestOtp('driver@example.com');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ identifier: 'driver@example.com' });
  });

  it('throws an ApiError carrying the tag and status on failure', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(400, { tag: 'InviteCodeRequired', requestId: 'r1' }));

    await expect(requestOtp('driver@example.com')).rejects.toMatchObject({
      tag: 'InviteCodeRequired',
      status: 400,
    });
    await expect(requestOtp('driver@example.com')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('verifyOtp', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses a successful response into the shared contract shape', async () => {
    const body = {
      accessToken: 'access.token.value',
      refreshToken: 'refresh-token-value',
      driver: {
        id: 'driver-1',
        identifier: 'driver@example.com',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    };
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, body));

    const result = await verifyOtp('driver@example.com', '123456');
    expect(result).toEqual(body);
  });

  it('surfaces OtpIncorrect with attemptsRemaining for the UI to show', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { tag: 'OtpIncorrect', attemptsRemaining: 2, requestId: 'r1' }),
      );

    await expect(verifyOtp('driver@example.com', 'wrong')).rejects.toMatchObject({
      tag: 'OtpIncorrect',
      status: 401,
      attemptsRemaining: 2,
    });
  });
});

describe('refreshAccessToken', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses a successful refresh response', async () => {
    const body = { accessToken: 'new-access', refreshToken: 'new-refresh' };
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, body));

    await expect(refreshAccessToken('old-refresh')).resolves.toEqual(body);
  });

  it('throws on a reused refresh token (revoked session)', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { tag: 'RefreshTokenReused', requestId: 'r1' }));

    await expect(refreshAccessToken('old-refresh')).rejects.toMatchObject({
      tag: 'RefreshTokenReused',
      status: 401,
    });
  });
});
