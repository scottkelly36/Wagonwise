import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import * as staffApi from '../api/staff';
import { useStaffAuthStore, type StaffSession } from './staff-auth-store';

vi.mock('../api/staff');

const refresh = vi.mocked(staffApi.refresh);

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const staff = {
  id: 's1',
  name: 'Sam',
  email: 'sam@example.com',
  kind: 'fleet',
} as StaffSession['staff'];
const session = (accessToken: string, refreshToken: string): StaffSession => ({
  accessToken,
  refreshToken,
  staff,
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  refresh.mockReset();
  useStaffAuthStore.getState().signIn(session('old-access', 'refresh-1'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** A call that works only with the new access token, as the server would. */
const needsNewToken = (accessToken: string): Promise<string> =>
  accessToken === 'new-access'
    ? Promise.resolve(`ok:${accessToken}`)
    : Promise.reject(new ApiError('Unauthorized', 401));

describe('withAccessToken', () => {
  it('refreshes once and retries when the access token has run out', async () => {
    refresh.mockResolvedValue({ accessToken: 'new-access', refreshToken: 'refresh-2' });
    const result = await useStaffAuthStore.getState().withAccessToken(needsNewToken);
    expect(result).toBe('ok:new-access');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('refresh-1');
    expect(useStaffAuthStore.getState().session).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'refresh-2',
    });
  });

  it('refreshes only once when many calls run out of token together (returning to a tab), so the refresh token is used once', async () => {
    let finish: (tokens: { accessToken: string; refreshToken: string }) => void = () => undefined;
    refresh.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const store = useStaffAuthStore.getState();
    const calls = [1, 2, 3, 4, 5].map(() => store.withAccessToken(needsNewToken));
    // Let every call fail and reach the refresh before it answers.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    finish({ accessToken: 'new-access', refreshToken: 'refresh-2' });
    const results = await Promise.all(calls);
    expect(results).toEqual(Array(5).fill('ok:new-access'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh again with the old refresh token when a call fails after another has already refreshed', async () => {
    refresh.mockResolvedValue({ accessToken: 'new-access', refreshToken: 'refresh-2' });
    const store = useStaffAuthStore.getState();
    // The first call refreshes. A second call that started before it finished, with the old access token, fails afterwards.
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const late = store.withAccessToken(async (token) => {
      await slow;
      return needsNewToken(token);
    });
    await store.withAccessToken(needsNewToken);
    release();
    expect(await late).toBe('ok:new-access');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('signs out when the refresh fails', async () => {
    refresh.mockRejectedValue(new ApiError('StaffSessionRevoked', 401));
    await expect(
      useStaffAuthStore.getState().withAccessToken(needsNewToken),
    ).rejects.toBeInstanceOf(ApiError);
    expect(useStaffAuthStore.getState().session).toBeUndefined();
  });
});
