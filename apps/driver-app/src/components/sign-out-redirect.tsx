import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuthStore } from '../state/auth-store';

/**
 * Takes the driver to the sign-in screen whenever they become signed out while the app is open, wherever they are. Signing out
 * from More already navigates, but a session the server ends (revoked or expired, found by `useOpportunisticRefresh`) only changes
 * the store, which left the driver on a signed-in screen with nothing to show. Only a change from signed in to signed out counts:
 * the start-up path, signed out from the first moment, is the redirect in `app/index.tsx`. Renders nothing.
 */
export function SignOutRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.state.status);
  const was = useRef(status);

  useEffect(() => {
    const before = was.current;
    was.current = status;
    if (before === 'signedIn' && status === 'signedOut' && pathname !== '/sign-in') {
      router.replace('/sign-in');
    }
  }, [status, pathname, router]);

  return null;
}
