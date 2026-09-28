import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../state/auth-store';

/** Every route under `Layout` needs a signed-in driver with dashboard access (WagonWise admin, or
 *  a Fleet user with at least one granted scope — `SignIn.tsx`'s own gate already enforced that
 *  before `signIn()` was ever called) — redirects to `/sign-in` otherwise. Client-side only: every
 *  real endpoint this app calls still enforces its own authorization server-side (identity's/
 *  companies'/fleet's own `interface/routes.ts`), so this is a UX convenience, not the actual
 *  security boundary. */
export function RequireAdmin() {
  const state = useAuthStore((s) => s.state);
  if (state.status !== 'signedIn') {
    return <Navigate to="/sign-in" replace />;
  }
  return <Outlet />;
}
