import type { CSSProperties } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

/** Two sections, not one flat nav — the two things asked for so far (2026-09-26): a
 *  fleet/dispatcher view for a business tracking its own drivers, and an admin/moderation view
 *  over what already exists in core (hazard reports, congestion reports, driver accounts). Which
 *  business sees which drivers, and how a dispatcher/admin actually signs in, are both still
 *  undecided — see `pages/SignIn.tsx`. */
const FLEET_LINKS = [
  { to: '/fleet', label: 'Overview' },
  { to: '/fleet/live-trips', label: 'Live trips' },
  { to: '/fleet/drivers', label: 'Drivers' },
  { to: '/fleet/vehicle-profiles', label: 'Vehicle profiles' },
] as const;

const ADMIN_LINKS = [
  { to: '/admin/hazard-reports', label: 'Hazard reports' },
  { to: '/admin/congestion-reports', label: 'Congestion reports' },
  { to: '/admin/driver-accounts', label: 'Driver accounts' },
] as const;

export function Layout() {
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

        <p style={navSectionStyle}>Admin</p>
        {ADMIN_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} style={navLinkStyle}>
            {link.label}
          </NavLink>
        ))}
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
