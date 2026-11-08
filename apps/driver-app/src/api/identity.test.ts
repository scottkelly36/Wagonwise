import {
  deleteAccount,
  giveConsent,
  setDriverName,
  registerDevice,
  requestOtp,
  verifyOtp,
  refreshAccessToken,
  getSignInOptions,
  requestSignup,
  confirmSignup,
  passwordSignIn,
  passwordVerify,
  requestPasswordReset,
  confirmPasswordReset,
  setPassword,
  requestAddEmail,
  confirmAddEmail,
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
        scopes: [],
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

describe('setDriverName', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('puts the name with a bearer token, parsing the updated driver', async () => {
    const body = {
      id: 'driver-1',
      identifier: 'driver@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'Dave Kelly',
      isAdmin: false,
      scopes: [],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, body));
    globalThis.fetch = fetchMock;

    const result = await setDriverName('token-1', 'Dave Kelly');

    expect(result).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/identity\/name$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Dave Kelly' });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
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
      scopes: [],
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

describe('refreshAccessToken, one at a time per token', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const tokens = { accessToken: 'a2', refreshToken: 'r2' };

  it('shares one request between calls made with the same token while it is on its way', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, tokens));
    globalThis.fetch = fetchMock;

    const [first, second] = await Promise.all([
      refreshAccessToken('same-token'),
      refreshAccessToken('same-token'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(tokens);
    expect(second).toEqual(tokens);
  });

  it('sends a separate request for a different token, and again once the first has finished', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, tokens));
    globalThis.fetch = fetchMock;

    await Promise.all([refreshAccessToken('token-a'), refreshAccessToken('token-b')]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await refreshAccessToken('token-a');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lets the next attempt through after a failure', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(jsonResponse(200, tokens));
    globalThis.fetch = fetchMock;

    await expect(refreshAccessToken('flaky')).rejects.toBeInstanceOf(TypeError);
    await expect(refreshAccessToken('flaky')).resolves.toEqual(tokens);
  });
});

describe('email and password sign-in calls', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const signedIn = {
    accessToken: 'a',
    refreshToken: 'r',
    driver: {
      id: '11111111-1111-4111-8111-111111111111',
      identifier: 'driver@example.com',
      createdAt: '2026-11-01T09:00:00.000Z',
      isAdmin: false,
      scopes: [],
    },
  };

  function call(fetchMock: jest.Mock): { url: string; init: RequestInit; body: unknown } {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return {
      url,
      init,
      body: init.body === undefined ? undefined : JSON.parse(init.body as string),
    };
  }

  const authorization = (init: RequestInit): string | undefined =>
    (init.headers as Record<string, string>).authorization;

  it('asks which ways in are on, with a GET and no body', async () => {
    const options = { passwordSignIn: true, inviteRequired: false, google: false, apple: false };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, options));
    globalThis.fetch = fetchMock;

    await expect(getSignInOptions()).resolves.toEqual(options);

    const sent = call(fetchMock);
    expect(sent.url).toMatch(/\/identity\/sign-in-options$/);
    expect(sent.init.method).toBe('GET');
    expect(sent.init.body).toBeUndefined();
  });

  it('rejects an answer in the wrong shape', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { passwordSignIn: 'yes' }));
    await expect(getSignInOptions()).rejects.toThrow();
  });

  it('posts the sign-up steps, the password going only with the code', async () => {
    const request = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    globalThis.fetch = request;
    await requestSignup('new@example.com');
    expect(call(request).url).toMatch(/\/identity\/signup\/request$/);
    expect(call(request).body).toEqual({ email: 'new@example.com' });

    const confirm = jest.fn().mockResolvedValue(jsonResponse(200, signedIn));
    globalThis.fetch = confirm;
    await confirmSignup({ email: 'new@example.com', password: 'three long words', code: '123456' });
    expect(call(confirm).url).toMatch(/\/identity\/signup\/confirm$/);
    expect(call(confirm).body).toEqual({
      email: 'new@example.com',
      password: 'three long words',
      code: '123456',
    });
  });

  it('signs in in two steps: the password, then the code', async () => {
    const first = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    globalThis.fetch = first;
    await passwordSignIn('driver@example.com', 'three long words');
    expect(call(first).url).toMatch(/\/identity\/password\/sign-in$/);
    expect(call(first).body).toEqual({
      identifier: 'driver@example.com',
      password: 'three long words',
    });

    const second = jest.fn().mockResolvedValue(jsonResponse(200, signedIn));
    globalThis.fetch = second;
    await expect(passwordVerify('driver@example.com', '123456')).resolves.toMatchObject({
      accessToken: 'a',
    });
    expect(call(second).url).toMatch(/\/identity\/password\/verify$/);
  });

  it('carries the one error for a wrong email or password', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { tag: 'InvalidCredentials', requestId: 'r' }));
    await expect(passwordSignIn('driver@example.com', 'nope')).rejects.toMatchObject({
      tag: 'InvalidCredentials',
      status: 401,
    });
  });

  it('resets a password in two steps', async () => {
    const first = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    globalThis.fetch = first;
    await requestPasswordReset('driver@example.com');
    expect(call(first).url).toMatch(/\/identity\/password\/reset\/request$/);

    const second = jest.fn().mockResolvedValue(jsonResponse(200, signedIn));
    globalThis.fetch = second;
    await confirmPasswordReset({
      email: 'driver@example.com',
      code: '123456',
      newPassword: 'a brand new one',
    });
    expect(call(second).url).toMatch(/\/identity\/password\/reset\/confirm$/);
    expect(call(second).body).toEqual({
      email: 'driver@example.com',
      code: '123456',
      newPassword: 'a brand new one',
    });
  });

  it('adds a password with a PUT and the access token, expecting 204', async () => {
    const fetchMock = jest.fn().mockResolvedValue(noBodyResponse(204));
    globalThis.fetch = fetchMock;
    await setPassword('tok', 'three long words');
    const sent = call(fetchMock);
    expect(sent.url).toMatch(/\/identity\/account\/password$/);
    expect(sent.init.method).toBe('PUT');
    expect(authorization(sent.init)).toBe('Bearer tok');
    expect(sent.body).toEqual({ password: 'three long words' });
  });

  it('adds an email in two signed-in steps and returns the updated driver', async () => {
    const first = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    globalThis.fetch = first;
    await requestAddEmail('tok', 'new@example.com');
    expect(call(first).url).toMatch(/\/identity\/account\/email\/request$/);
    expect(authorization(call(first).init)).toBe('Bearer tok');

    const second = jest.fn().mockResolvedValue(jsonResponse(200, signedIn.driver));
    globalThis.fetch = second;
    await expect(confirmAddEmail('tok', 'new@example.com', '123456')).resolves.toMatchObject({
      identifier: 'driver@example.com',
    });
    expect(call(second).body).toEqual({ email: 'new@example.com', code: '123456' });
  });
});
