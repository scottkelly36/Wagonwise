import { ApiError } from '../api/errors';
import { classifyRefreshFailure, retryDelayMs } from './refresh-failure';

describe('classifyRefreshFailure', () => {
  it('says the sign-in is dead only when the server says so', () => {
    for (const tag of [
      'SessionNotFound',
      'SessionRevoked',
      'SessionExpired',
      'RefreshTokenReused',
      'RefreshTokenInvalid',
      'DriverNotFound',
    ]) {
      expect(classifyRefreshFailure(new ApiError(tag, 401))).toBe('dead');
    }
  });

  it('treats no signal, a timeout, a restarting server and anything else as temporary', () => {
    expect(classifyRefreshFailure(new TypeError('Network request failed'))).toBe('transient');
    expect(classifyRefreshFailure(new Error('timeout'))).toBe('transient');
    expect(classifyRefreshFailure(new ApiError('UnknownError', 502))).toBe('transient');
    expect(classifyRefreshFailure(new ApiError('UnknownError', 503))).toBe('transient');
    expect(classifyRefreshFailure(new ApiError('TooManyAttempts', 429))).toBe('transient');
    expect(classifyRefreshFailure(undefined)).toBe('transient');
  });
});

describe('retryDelayMs', () => {
  it('waits longer each time, up to five minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(retryDelayMs)).toEqual([
      15_000, 30_000, 60_000, 120_000, 300_000, 300_000, 300_000,
    ]);
  });

  it('never waits less than the first step', () => {
    expect(retryDelayMs(0)).toBe(15_000);
    expect(retryDelayMs(-3)).toBe(15_000);
  });
});
