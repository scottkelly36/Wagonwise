import type { StaffAccountDto } from '@wagonwise/contracts/staff';
import { create } from 'zustand';
import { ApiError } from '../api/errors';
import * as staffApi from '../api/staff';
import { clearSession, loadSession, saveSession, type SessionStores } from '../lib/saved-session';

const SESSION_KEY = 'wagonwise-dashboard.staffSession';

export interface StaffSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly staff: StaffAccountDto;
}

export interface StaffAuthStore {
  readonly session: StaffSession | undefined;
  /** `remember` keeps the session on this computer past the tab (until sign-out or 7 days unused); otherwise it ends with the tab. */
  signIn(session: StaffSession, remember?: boolean): void;
  signOut(): Promise<void>;
  setStaff(staff: StaffAccountDto): void;
  /**
   * Runs `call` with the current access token. On a 401 (the 15-minute token ran out) it
   * refreshes once and retries; if the refresh fails too, the session is over and it signs out.
   */
  withAccessToken<T>(call: (accessToken: string) => Promise<T>): Promise<T>;
}

/**
 * The staff session (P2-M1.10), the dashboard's only sign-in since P2-M1.12c. By default kept in
 * `sessionStorage`: it survives a reload but ends with the tab, since a staff refresh token is good for 7 days and
 * shouldn't sit on a shared machine. "Keep me signed in on this computer" (the sign-in box) puts it in `localStorage`
 * instead, so closing the browser does not sign anyone out. The server side is the same either way: a refresh token
 * lasts 7 days from its last use, and Sign out ends it.
 */
function browserStores(): SessionStores {
  return { local: localStorage, session: sessionStorage };
}

export const useStaffAuthStore = create<StaffAuthStore>((set, get) => {
  const restored = restore();
  // Whether the session lives on the computer (so later saves, such as a token refresh, go back to the same place).
  let remembered = restored?.remembered ?? false;
  // The refresh in progress, shared by every call that runs out of token at the same time. Coming back to a tab makes every open
  // page ask again at once, so each would otherwise refresh with the same refresh token: the server treats the second use of a
  // refresh token as theft and ends the session, which signed people out for no reason.
  let refreshing: Promise<Awaited<ReturnType<typeof staffApi.refresh>>> | undefined;
  function refreshOnce(
    refreshToken: string,
  ): Promise<Awaited<ReturnType<typeof staffApi.refresh>>> {
    refreshing ??= staffApi.refresh(refreshToken).finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  function save(session: StaffSession | undefined): void {
    try {
      if (session === undefined) clearSession(browserStores(), SESSION_KEY);
      else saveSession(browserStores(), SESSION_KEY, session, remembered);
    } catch {
      // Storage unavailable (private mode): the session still works for this page load.
    }
    set({ session });
  }

  return {
    session: restored?.session,

    signIn(session, remember = false) {
      remembered = remember;
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
      // Another call may have refreshed while this one was failing: its refresh token has been used, so use the new access token
      // it saved rather than refreshing again with the old one.
      const now = get().session;
      if (now === undefined) throw new ApiError('NotSignedIn', 401);
      if (now.accessToken !== current.accessToken) return call(now.accessToken);
      let tokens;
      try {
        tokens = await refreshOnce(current.refreshToken);
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

function restore(): { session: StaffSession; remembered: boolean } | undefined {
  try {
    return loadSession<StaffSession>(browserStores(), SESSION_KEY);
  } catch {
    return undefined;
  }
}
