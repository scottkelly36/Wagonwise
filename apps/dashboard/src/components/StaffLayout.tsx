import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStaffAuthStore } from '../state/staff-auth-store';

/** The staff-account area (P2-M1.10). Until the cutover (P2-M1.12) the fleet and admin pages are
 *  still under the driver sign-in, linked from here. */
export function StaffLayout() {
  const navigate = useNavigate();
  const session = useStaffAuthStore((s) => s.session);
  const signOut = useStaffAuthStore((s) => s.signOut);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 220, borderRight: '1px solid #e5e7eb', padding: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 16 }}>WagonWise</p>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Staff account
        </p>
        <NavLink to="/staff/users" style={{ display: 'block', padding: '6px 0', color: '#111827' }}>
          Users
        </NavLink>
        <NavLink
          to="/staff/activity"
          style={{ display: 'block', padding: '6px 0', color: '#111827' }}
        >
          Activity
        </NavLink>
        <NavLink to="/fleet" style={{ display: 'block', padding: '6px 0', color: '#6b7280' }}>
          Fleet &amp; admin pages (driver sign-in)
        </NavLink>

        {session !== undefined && (
          <div style={{ marginTop: 32, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <p style={{ fontSize: 13, marginBottom: 2 }}>{session.staff.name}</p>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              {session.staff.kind === 'platform' ? 'WagonWise staff' : session.staff.email}
            </p>
            <button
              onClick={() => {
                void signOut().then(() => navigate('/staff/sign-in'));
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </nav>
      <main style={{ flex: 1, padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
