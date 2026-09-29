import type { StaffAccountDto } from '@wagonwise/contracts/staff';
import type { CSSProperties } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { holds, isPlatform } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';

interface NavItem {
  readonly to: string;
  readonly label: string;
  /** Whether to offer the link. Only what the menu shows: core checks every request itself. */
  readonly shows: (staff: StaffAccountDto) => boolean;
}

const everyone = () => true;

/** Three sections: a company's own fleet, its people, and WagonWise's own admin pages. Since
 *  P2-M1.12c this is the dashboard's only layout, under the one staff sign-in. */
const SECTIONS: readonly { readonly title: string; readonly items: readonly NavItem[] }[] = [
  {
    title: 'Fleet',
    items: [
      { to: '/fleet', label: 'Overview', shows: everyone },
      { to: '/fleet/live-trips', label: 'Live trips', shows: everyone },
      { to: '/fleet/drivers', label: 'Drivers', shows: everyone },
      {
        to: '/fleet/vehicle-profiles',
        label: 'Vehicle profiles',
        shows: (s) => holds(s, 'manage_fleet'),
      },
    ],
  },
  {
    title: 'Your team',
    items: [
      { to: '/staff/users', label: 'Users', shows: (s) => holds(s, 'manage_users') },
      { to: '/staff/activity', label: 'Activity', shows: (s) => holds(s, 'manage_users') },
    ],
  },
  {
    title: 'WagonWise admin',
    items: [
      { to: '/admin/companies', label: 'Companies', shows: isPlatform },
      { to: '/admin/invite-codes', label: 'Invite codes', shows: isPlatform },
      { to: '/admin/hazard-reports', label: 'Hazard reports', shows: isPlatform },
      { to: '/admin/congestion-reports', label: 'Congestion reports', shows: isPlatform },
      { to: '/admin/driver-accounts', label: 'Driver accounts', shows: isPlatform },
    ],
  },
];

export function StaffLayout() {
  const navigate = useNavigate();
  const session = useStaffAuthStore((s) => s.session);
  const signOut = useStaffAuthStore((s) => s.signOut);
  const staff = session?.staff;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 220, borderRight: '1px solid #e5e7eb', padding: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 16 }}>WagonWise</p>

        {staff !== undefined &&
          SECTIONS.map((section) => {
            const items = section.items.filter((item) => item.shows(staff));
            if (items.length === 0) return null;
            return (
              <div key={section.title}>
                <p style={navSectionStyle}>{section.title}</p>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end style={navLinkStyle}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}

        {staff !== undefined && (
          <div style={{ marginTop: 32, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <p style={{ fontSize: 13, marginBottom: 2 }}>{staff.name}</p>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              {staff.kind === 'platform' ? 'WagonWise staff' : staff.email}
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
