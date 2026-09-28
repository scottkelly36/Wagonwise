import type { CSSProperties } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../state/auth-store';

/** Two sections, not one flat nav — a fleet/dispatcher view for a business tracking its own
 *  drivers, and an admin/moderation view over what already exists in core (companies, hazard
 *  reports, congestion reports, driver accounts). Which business sees which drivers is still
 *  undecided (see `pages/fleet/Overview.tsx`); company creation and driver assignment (admin
 *  side, 2026-09-27) are real now. */
const FLEET_LINKS = [
  { to: '/fleet', label: 'Overview' },
  { to: '/fleet/live-trips', label: 'Live trips' },
  { to: '/fleet/drivers', label: 'Drivers' },
  { to: '/fleet/vehicle-profiles', label: 'Vehicle profiles' },
] as const;

const ADMIN_LINKS = [
  { to: '/admin/companies', label: 'Companies' },
  { to: '/admin/invite-codes', label: 'Invite codes' },
  { to: '/admin/hazard-reports', label: 'Hazard reports' },
  { to: '/admin/congestion-reports', label: 'Congestion reports' },
  { to: '/admin/driver-accounts', label: 'Driver accounts' },
] as const;

export function Layout() {
  const navigate = useNavigate();
  const state = useAuthStore((s) => s.state);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 220, borderRight: '1px solid #e5e7eb', padding: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 16 }}>WagonWise</p>

        <p style={navSectionStyle}>Fleet</p>
        {FLEET_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} style={navLinkStyle}>
            {link.label}
          </NavLink>
        ))}

        {state.status === 'signedIn' && state.driver.isAdmin && (
          <>
            <p style={navSectionStyle}>Admin</p>
            {ADMIN_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} style={navLinkStyle}>
                {link.label}
              </NavLink>
            ))}
          </>
        )}

        {state.status === 'signedIn' && (
          <div style={{ marginTop: 32, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              {state.driver.identifier}
            </p>
            <button
              onClick={() => {
                signOut();
                navigate('/sign-in');
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

const navSectionStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  marginTop: 20,
  marginBottom: 8,
};

const navLinkStyle: CSSProperties = {
  display: 'block',
  padding: '6px 0',
  color: '#111827',
  textDecoration: 'none',
};
