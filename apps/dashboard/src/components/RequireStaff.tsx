import { Navigate, Outlet } from 'react-router-dom';
import { useStaffAuthStore } from '../state/staff-auth-store';

/** Staff pages need a staff session; otherwise to the staff sign-in. Client-side only: core
 *  checks every request itself, and its database refuses other companies' rows too. */
export function RequireStaff() {
  const session = useStaffAuthStore((s) => s.session);
  return session === undefined ? <Navigate to="/staff/sign-in" replace /> : <Outlet />;
}
