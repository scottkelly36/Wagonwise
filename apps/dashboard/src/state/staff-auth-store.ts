import type { StaffAccountDto } from '@wagonwise/contracts/staff';
import { create } from 'zustand';
import { ApiError } from '../api/errors';
import * as staffApi from '../api/staff';

const SESSION_KEY = 'wagonwise-dashboard.staffSession';

export interface StaffSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly staff: StaffAccountDto;
}

export interface StaffAuthStore {
  readonly session: StaffSession | undefined;
  signIn(session: StaffSession): void;
  signOut(): Promise<void>;
  setStaff(staff: StaffAccountDto): void;
  /**
   * Runs `call` with the current access token. On a 401 (the 15-minute token ran out) it
   * refreshes once and retries; if the refresh fails too, the session is over and it signs out.
   */
  withAccessToken<T>(call: (accessToken: string) => Promise<T>): Promise<T>;
}

/**
 * The staff session (P2-M1.10), separate from the driver session in `auth-store.ts`: until the
 * cutover (P2-M1.12) the existing admin pages still sign in as a driver, so both can be open at
 * once. Kept in `sessionStorage`, not `localStorage`: it survives a reload but ends with the tab,
 * since a staff refresh token is good for 7 days and shouldn't sit on a shared machine.
 */
export const useStaffAuthStore = create<StaffAuthStore>((set, get) => {
  function save(session: StaffSession | undefined): void {
    try {
      if (session === undefined) sessionStorage.removeItem(SESSION_KEY);
      else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage unavailable (private mode): the session still works for this page load.
    }
    set({ session });
  }

  return {
    session: restore(),

    signIn(session) {
      save(session);
    },

    async signOut() {
      const current = get().session;
      save(undefined);
      if (current !== undefined) {
        // Best effort: the local session is gone either way.
        await staffApi.signOut(current.refreshToken).catch(() => undefined);
      }
    },

    setStaff(staff) {
      const current = get().session;
      if (current !== undefined) save({ ...current, staff });
    },

    async withAccessToken(call) {
      const current = get().session;
      if (current === undefined) throw new ApiError('NotSignedIn', 401);
      try {
        return await call(current.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
      let tokens;
      try {
        tokens = await staffApi.refresh(current.refreshToken);
      } catch (error) {
        save(undefined);
        throw error;
      }
      const latest = get().session ?? current;
      save({ ...latest, ...tokens });
      return call(tokens.accessToken);
    },
  };
});

function restore(): StaffSession | undefined {
  try {
    const json = sessionStorage.getItem(SESSION_KEY);
    return json === null ? undefined : (JSON.parse(json) as StaffSession);
  } catch {
    return undefined;
  }
}
