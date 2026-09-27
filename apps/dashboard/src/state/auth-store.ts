import type { DriverDto } from '@wagonwise/contracts/identity';
import { create } from 'zustand';

const ACCESS_TOKEN_KEY = 'wagonwise-dashboard.accessToken';
const DRIVER_KEY = 'wagonwise-dashboard.driver';

export type AuthState =
  | { readonly status: 'signedOut' }
  | { readonly status: 'signedIn'; readonly accessToken: string; readonly driver: DriverDto };

export interface AuthStore {
  readonly state: AuthState;
  signIn(accessToken: string, driver: DriverDto): void;
  signOut(): void;
  /** Called after a successful `PATCH /identity/drivers/:id` on the signed-in admin's own row
   *  (self-service isn't a flow this app has, but nothing stops an admin editing themselves in
   *  user management) — keeps the cached driver in sync without a page reload. */
  setDriver(driver: DriverDto): void;
}

/** Persists to `localStorage`, not a real refresh flow — access tokens are 15-minute-lived
 *  (`core`'s `ed25519-token-signer.ts`), so a long admin session just means signing in again
 *  once it expires, rather than this app owning refresh-token rotation too. Fine for an internal
 *  tool at this stage; revisit if a 15-minute timeout turns out to actually bother anyone. */
export const useAuthStore = create<AuthStore>((set) => ({
  state: restore(),

  signIn(accessToken, driver) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(DRIVER_KEY, JSON.stringify(driver));
    set({ state: { status: 'signedIn', accessToken, driver } });
  },

  signOut() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(DRIVER_KEY);
    set({ state: { status: 'signedOut' } });
  },

  setDriver(driver) {
    localStorage.setItem(DRIVER_KEY, JSON.stringify(driver));
    set((current) =>
      current.state.status === 'signedIn' ? { state: { ...current.state, driver } } : current,
    );
  },
}));

function restore(): AuthState {
  try {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const driverJson = localStorage.getItem(DRIVER_KEY);
    if (!accessToken || !driverJson) {
      return { status: 'signedOut' };
    }
    return { status: 'signedIn', accessToken, driver: JSON.parse(driverJson) as DriverDto };
  } catch {
    return { status: 'signedOut' };
  }
}
