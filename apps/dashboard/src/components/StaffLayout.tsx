import type { StaffAccountDto } from '@wagonwise/contracts/staff';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { holds, isPlatform } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { WeatherBanner } from './WeatherBanner';

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
      { to: '/fleet/jobs', label: 'Jobs', shows: everyone },
      { to: '/fleet/live-trips', label: 'Live trips', shows: everyone },
      { to: '/fleet/drivers', label: 'Drivers', shows: everyone },
      { to: '/fleet/places', label: 'Places', shows: everyone },
      {
        to: '/fleet/reports',
        label: 'Reports',
        shows: (s) => isPlatform(s) || holds(s, 'view_reports'),
      },
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
      { to: '/admin/moderation', label: 'Moderation', shows: isPlatform },
      { to: '/admin/hazard-reports', label: 'Hazard reports', shows: isPlatform },
      { to: '/admin/congestion-reports', label: 'Congestion reports', shows: isPlatform },
    ],
  },
];

export function StaffLayout() {
  const navigate = useNavigate();
  const session = useStaffAuthStore((s) => s.session);
  const signOut = useStaffAuthStore((s) => s.signOut);
  const staff = session?.staff;

  // On a phone the menu is a drawer. It closes when a page is chosen, and on Escape.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className="shell">
      <nav id="main-nav" className={navOpen ? 'sidebar open' : 'sidebar'} aria-label="Main">
        <div className="brand">
          <span className="brand-mark" />
          WagonWise
        </div>

        {staff !== undefined &&
          SECTIONS.map((section) => {
            const items = section.items.filter((item) => item.shows(staff));
            if (items.length === 0) return null;
            return (
              <div key={section.title}>
                <p className="nav-section">{section.title}</p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
      </nav>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      <div className="main-column">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            aria-controls="main-nav"
            onClick={() => setNavOpen((open) => !open)}
          >
            <span aria-hidden="true">{navOpen ? '✕' : '☰'}</span>
          </button>
          {staff !== undefined && (
            <>
              <div className="who">
                {staff.name}
                <small>{staff.kind === 'platform' ? 'WagonWise staff' : staff.email}</small>
              </div>
              <span className="avatar">{staff.name.trim().charAt(0).toUpperCase()}</span>
              <button
                className="btn-light"
                onClick={() => {
                  void signOut().then(() => navigate('/staff/sign-in'));
                }}
              >
                Sign out
              </button>
            </>
          )}
        </header>
        <main className="content">
          <WeatherBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
