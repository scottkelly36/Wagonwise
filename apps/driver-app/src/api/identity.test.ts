import {
  deleteAccount,
  giveConsent,
  registerDevice,
  requestOtp,
  verifyOtp,
  refreshAccessToken,
} from './identity';
import { ApiError } from './errors';

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
    json: () => Promise.reject(new Error('should not be called')),
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
        isAdmin: false,
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

describe('registerDevice', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the push token with a bearer token, parsing the 201 response', async () => {
    const body = {
      id: 'device-1',
      driverId: 'driver-1',
      pushToken: 'ExponentPushToken[xxx]',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, body));
    globalThis.fetch = fetchMock;

    const result = await registerDevice('token-1', 'ExponentPushToken[xxx]');

    expect(result).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/identity\/devices$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({ pushToken: 'ExponentPushToken[xxx]' });
  });
});

describe('giveConsent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts with a bearer token, parsing the updated driver', async () => {
    const body = {
      id: 'driver-1',
      identifier: 'driver@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      consentedAt: '2026-06-15T08:00:00.000Z',
      isAdmin: false,
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, body));
    globalThis.fetch = fetchMock;

    const result = await giveConsent('token-1');

    expect(result).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/identity\/consent$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });
});

describe('deleteAccount', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a DELETE with a bearer token, resolving on a 204', async () => {
    const fetchMock = jest.fn().mockResolvedValue(noBodyResponse(204));
    globalThis.fetch = fetchMock;

    await deleteAccount('token-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/identity\/account$/);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });

  it('throws an ApiError on failure', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { tag: 'DriverNotFound', requestId: 'r1' }));

    await expect(deleteAccount('token-1')).rejects.toBeInstanceOf(ApiError);
  });
});
