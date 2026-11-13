import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getAppVersionInfo } from '../api/app-version';
import { useConnectionStore } from '../state/connection-store';

export const PROBE_EVERY_MS = 15_000;

/**
 * While the phone has no signal, tries a tiny request every few seconds and whenever the app comes back to the front, so the "No signal"
 * chip goes as soon as there is signal again even if nothing else is asking. Does nothing while online.
 */
export function useConnectionProbe(): void {
  const offline = useConnectionStore((s) => s.offline);

  useEffect(() => {
    if (!offline) return;
    // The request itself updates the connection store (`api/http.ts`); its result is not needed here.
    const probe = (): void => void getAppVersionInfo().catch(() => undefined);
    const timer = setInterval(probe, PROBE_EVERY_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') probe();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [offline]);
}
