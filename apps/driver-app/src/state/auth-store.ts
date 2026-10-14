import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { refreshAccessToken } from '../api/identity';
import { classifyRefreshFailure } from '../lib/refresh-failure';

const REFRESH_TOKEN_KEY = 'wagonwise.refreshToken';
const DRIVER_KEY = 'wagonwise.driver';

export interface DriverInfo {
  readonly id: string;
  readonly identifier: string;
  readonly createdAt: string;
  /** What the driver likes to be called; absent until they give one. */
  readonly name?: string;
  /** Design doc §9's privacy notice/consent screen (M8) — absent until the driver accepts it;
   *  `index.tsx`'s gate uses this to decide whether to show it. */
  readonly consentedAt?: string;
}

export type AuthState =
  | { readonly status: 'restoring' }
  | { readonly status: 'signedOut' }
  | {
      readonly status: 'signedIn';
      readonly accessToken: string;
      readonly refreshToken: string;
      readonly driver: DriverInfo;
    };

export interface AuthStore {
  readonly state: AuthState;
  /** Called once at app boot: loads a persisted refresh token from SecureStore and exchanges
   *  it for a fresh access token immediately, rather than waiting for a screen to need one —
   *  the same "refresh opportunistically" principle applied to cold start. */
  restore(): Promise<void>;
  signIn(tokens: { accessToken: string; refreshToken: string }, driver: DriverInfo): Promise<void>;
  signOut(): Promise<void>;
  /** Called after any refresh, opportunistic or not — the refresh token rotates on every use
   *  (decision 33), so the persisted copy must move with it or the next refresh replays a
   *  stale token and gets treated as reuse, revoking the whole session. */
  setTokens(accessToken: string, refreshToken: string): Promise<void>;
  /** Called after `POST /identity/consent` succeeds — updates the cached driver (persisted, so a
   *  relaunch doesn't show the consent screen again) without touching either token. */
  setDriver(driver: DriverInfo): Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  state: { status: 'restoring' },

  async restore() {
    const [storedRefreshToken, storedDriverJson] = await Promise.all([
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(DRIVER_KEY),
    ]);
    if (!storedRefreshToken || !storedDriverJson) {
      set({ state: { status: 'signedOut' } });
      return;
    }

    try {
      const driver = JSON.parse(storedDriverJson) as DriverInfo;
      const refreshed = await refreshAccessToken(storedRefreshToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshed.refreshToken);
      set({
        state: {
          status: 'signedIn',
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          driver,
        },
      });
    } catch (error) {
      if (classifyRefreshFailure(error) === 'transient') {
        // No signal, a tunnel or the server restarting is not the end of the sign-in. Keep the saved sign-in and the driver
        // signed in with no access token yet: the refresh hook tries again until it works. (This used to wipe the sign-in on
        // any failure, so opening the app in a poor-signal spot signed the driver out for good.)
        set({
          state: {
            status: 'signedIn',
            accessToken: '',
            refreshToken: storedRefreshToken,
            driver: JSON.parse(storedDriverJson) as DriverInfo,
          },
        });
        return;
      }
      // The server said this sign-in is over (revoked, expired, replayed): start fresh rather than getting stuck
      // showing a loading spinner forever.
      await Promise.all([
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.deleteItemAsync(DRIVER_KEY),
      ]);
      set({ state: { status: 'signedOut' } });
    }
  },

  async signIn(tokens, driver) {
    await Promise.all([
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
      SecureStore.setItemAsync(DRIVER_KEY, JSON.stringify(driver)),
    ]);
    set({
      state: {
        status: 'signedIn',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        driver,
      },
    });
  },

  async signOut() {
    await Promise.all([
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(DRIVER_KEY),
    ]);
    set({ state: { status: 'signedOut' } });
  },

  async setTokens(accessToken, refreshToken) {
    const current = get().state;
    if (current.status !== 'signedIn') return;
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    set({ state: { ...current, accessToken, refreshToken } });
  },

  async setDriver(driver) {
    const current = get().state;
    if (current.status !== 'signedIn') return;
    await SecureStore.setItemAsync(DRIVER_KEY, JSON.stringify(driver));
    set({ state: { ...current, driver } });
  },
}));
