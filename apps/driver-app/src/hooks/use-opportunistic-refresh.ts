import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { refreshAccessToken } from '../api/identity';
import { accessTokenExpiryMs } from '../lib/jwt';
import { refreshDelayMs, shouldRefreshOnResume } from '../lib/refresh-schedule';
import { useAuthStore } from '../state/auth-store';

/**
 * Keeps the signed-in driver's access token fresh without waiting for a 401: schedules a
 * refresh ahead of the token's real expiry, and checks again whenever the app returns to the
 * foreground (in case the scheduled timer never fired because the app was suspended). The
 * actual scheduling math lives in lib/refresh-schedule.ts, tested without timers or mocks —
 * this hook is thin glue over it, verified by design the same way M2.3/M2.4 verified a port/
 * pure-function pair before either had a real caller to run against.
 */
export function useOpportunisticRefresh(): void {
  const state = useAuthStore((s) => s.state);
  const setTokens = useAuthStore((s) => s.setTokens);
  const signOut = useAuthStore((s) => s.signOut);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    const { accessToken, refreshToken } = state;
    const expiryMs = accessTokenExpiryMs(accessToken);

    async function refreshNow(): Promise<void> {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const result = await refreshAccessToken(refreshToken);
        await setTokens(result.accessToken, result.refreshToken);
      } catch {
        // A dead, reused or expired refresh token — nothing left to do but sign out cleanly.
        await signOut();
      } finally {
        refreshingRef.current = false;
      }
    }

    const timer = setTimeout(() => void refreshNow(), refreshDelayMs(expiryMs, Date.now()));

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && shouldRefreshOnResume(expiryMs, Date.now())) {
        void refreshNow();
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [state, setTokens, signOut]);
}
