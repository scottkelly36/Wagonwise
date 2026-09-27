import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../state/auth-store';

/** Every route under `Layout` needs a signed-in admin — redirects to `/sign-in` otherwise.
 *  Client-side only: every real endpoint this app calls still enforces its own admin gate
 *  server-side (identity's/companies' own `interface/routes.ts`), so this is a UX convenience,
 *  not the actual security boundary. */
export function RequireAdmin() {
  const state = useAuthStore((s) => s.state);
  if (state.status !== 'signedIn') {
    return <Navigate to="/sign-in" replace />;
  }
  return <Outlet />;
}
