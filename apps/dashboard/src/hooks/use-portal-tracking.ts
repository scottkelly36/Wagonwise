import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import * as usageApi from '../api/usage';
import { PortalTracker, pageForPath } from '../lib/portal-tracker';
import { isPlatform } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';

const FLUSH_EVERY_MS = 30_000;

let tracker: PortalTracker | undefined;

/** The one tracker for this sitting in the portal: its random session id is made here, in memory, and is gone when the tab closes. */
export function getPortalTracker(): PortalTracker {
  tracker ??= new PortalTracker({
    send: (request, keepalive) =>
      useStaffAuthStore
        .getState()
        .withAccessToken((token) => usageApi.sendPortalEvents(token, request, keepalive)),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
  });
  return tracker;
}

/**
 * Records which pages a company's staff open, and sends them with the form steps in small batches (docs/company-account-states-scope.md,
 * "Portal tracking"). Mounted once, in the portal's layout. WagonWise's own staff are not tracked. Nothing here ever blocks a screen or shows
 * an error: a failed send is silent.
 */
export function usePortalTracking(): void {
  const location = useLocation();
  const staff = useStaffAuthStore((s) => s.session?.staff);
  const tracked = staff !== undefined && !isPlatform(staff);

  useEffect(() => {
    getPortalTracker().setEnabled(tracked);
  }, [tracked]);

  useEffect(() => {
    if (!tracked) return;
    const page = pageForPath(location.pathname);
    if (page !== undefined) getPortalTracker().page(page);
  }, [tracked, location.pathname]);

  useEffect(() => {
    if (!tracked) return;
    const t = getPortalTracker();
    const timer = setInterval(() => void t.flush(), FLUSH_EVERY_MS);
    const goingAway = () => {
      if (document.visibilityState === 'hidden') {
        t.leaveAllForms();
        void t.flush(true);
      }
    };
    document.addEventListener('visibilitychange', goingAway);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', goingAway);
    };
  }, [tracked]);
}
