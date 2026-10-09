import type { StaffAccountDto } from '@wagonwise/contracts/staff';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { foldingSections, sectionForPath, toggled } from '../lib/nav';
import { holds, isPlatform } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { WeatherBanner } from './WeatherBanner';

interface NavItem {
  readonly to: string;
  readonly label: string;
  /** Whether to offer the link. Only what the menu shows: core checks every request itself. */
  readonly shows: (staff: StaffAccountDto) => boolean;
}

/** The colour a section carries (a dot by its title and the edge of its current link), so areas are told apart at a glance. */
type Area = 'ops' | 'compliance' | 'money' | 'team' | 'admin';

interface NavSection {
  readonly title: string;
  readonly area: Area;
  readonly items: readonly NavItem[];
}

const everyone = () => true;
const seesChecks = (s: StaffAccountDto) =>
  holds(s, 'manage_fleet') || holds(s, 'dispatch') || holds(s, 'view_reports');

/** Where a person starts. Sits above the sections. */
const HOME: NavItem = { to: '/fleet', label: 'Overview', shows: everyone };

/**
 * The menu, grouped by what the work is. A long section folds away and only one is open at a time (`lib/nav.ts` has the
 * rule); the section holding the current page opens by itself. Since P2-M1.12c this is the dashboard's only layout, under the
 * one staff sign-in.
 */
const SECTIONS: readonly NavSection[] = [
  {
    title: 'Operations',
    area: 'ops',
    items: [
      { to: '/fleet/jobs', label: 'Jobs', shows: everyone },
      { to: '/fleet/live-trips', label: 'Live trips', shows: everyone },
      { to: '/fleet/drivers', label: 'Drivers', shows: everyone },
      { to: '/fleet/places', label: 'Places', shows: everyone },
    ],
  },
  {
    title: 'Costs and profit',
    area: 'money',
    items: [
      {
        to: '/fleet/fuel',
        label: 'Fuel',
        shows: (s) => isPlatform(s) || holds(s, 'manage_fleet') || holds(s, 'view_reports'),
      },
      {
        to: '/fleet/costs',
        label: 'Running costs and pay',
        shows: (s) => isPlatform(s) || holds(s, 'manage_billing'),
      },
      {
        to: '/fleet/job-costs',
        label: 'Job profit',
        shows: (s) => isPlatform(s) || holds(s, 'manage_billing'),
      },
      {
        to: '/fleet/outlook',
        label: 'Looking ahead',
        shows: (s) => isPlatform(s) || holds(s, 'manage_billing'),
      },
    ],
  },
  {
    title: 'Compliance',
    area: 'compliance',
    items: [
      { to: '/fleet/checks', label: 'Walk-round checks', shows: (s) => holds(s, 'manage_fleet') },
      { to: '/fleet/check-results', label: 'Check results', shows: seesChecks },
      { to: '/fleet/defects', label: 'Defects', shows: seesChecks },
      {
        to: '/fleet/maintenance',
        label: 'Maintenance',
        shows: (s) => holds(s, 'manage_maintenance') || seesChecks(s),
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
    area: 'team',
    items: [
      { to: '/staff/users', label: 'Users', shows: (s) => holds(s, 'manage_users') },
      { to: '/staff/activity', label: 'Activity', shows: (s) => holds(s, 'manage_users') },
      {
        to: '/staff/plan',
        label: 'Plan and invoices',
        // A company's own billing. WagonWise staff use the admin Plans and Invoices pages instead.
        shows: (s) => s?.kind === 'fleet' && s.privileges.includes('manage_billing'),
      },
      {
        to: '/staff/settings',
        label: 'Settings',
        shows: (s) => isPlatform(s) || holds(s, 'manage_users'),
      },
    ],
  },
  {
    title: 'Customers',
    area: 'admin',
    items: [
      { to: '/admin/companies', label: 'Companies', shows: isPlatform },
      { to: '/admin/invite-codes', label: 'Invite codes', shows: isPlatform },
      { to: '/admin/testers', label: 'Testers', shows: isPlatform },
    ],
  },
  {
    title: 'Money',
    area: 'money',
    items: [
      { to: '/admin/plans', label: 'Plans', shows: isPlatform },
      { to: '/admin/invoices', label: 'Invoices', shows: isPlatform },
      { to: '/admin/finances', label: 'Finances', shows: isPlatform },
      { to: '/admin/billing', label: 'Billing details', shows: isPlatform },
    ],
  },
  {
    title: 'Content',
    area: 'admin',
    items: [
      { to: '/admin/moderation', label: 'Moderation', shows: isPlatform },
      { to: '/admin/hazard-reports', label: 'Hazard reports', shows: isPlatform },
      { to: '/admin/congestion-reports', label: 'Congestion reports', shows: isPlatform },
    ],
  },
];

export function StaffLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
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

  // The sections this person can see, and which of them fold.
  const visible =
    staff === undefined
      ? []
      : SECTIONS.map((section) => ({
          ...section,
          items: section.items.filter((item) => item.shows(staff)),
        })).filter((section) => section.items.length > 0);
  const folding = foldingSections(visible);

  // Only one folded section is open at a time. Going to a page opens the section it belongs to; a click on a heading
  // overrides that until the person moves to another page.
  const [choice, setChoice] = useState<{ path: string; title: string | undefined } | undefined>(
    undefined,
  );
  const open =
    choice !== undefined && choice.path === pathname
      ? choice.title
      : sectionForPath(visible, pathname);

  return (
    <div className="shell">
      <nav id="main-nav" className={navOpen ? 'sidebar open' : 'sidebar'} aria-label="Main">
        <div className="brand">
          <span className="brand-mark" />
          WagonWise
        </div>

        {staff !== undefined && HOME.shows(staff) && (
          <NavLink
            to={HOME.to}
            end
            onClick={() => setNavOpen(false)}
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            {HOME.label}
          </NavLink>
        )}

        {visible.map((section) => {
          // A section of one link is just that link: a heading over a single entry says nothing.
          const [only] = section.items;
          if (section.items.length === 1 && only !== undefined) {
            return (
              <NavLink
                key={section.title}
                to={only.to}
                end
                onClick={() => setNavOpen(false)}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                {only.label}
              </NavLink>
            );
          }
          const folds = folding.has(section.title);
          const expanded = !folds || open === section.title;
          const listId = `nav-${section.title.toLowerCase().replace(/\s+/g, '-')}`;
          return (
            <div key={section.title} className="nav-group" data-area={section.area}>
              {folds ? (
                <button
                  type="button"
                  className="nav-section nav-toggle"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => setChoice({ path: pathname, title: toggled(open, section.title) })}
                >
                  <span>{section.title}</span>
                  <span className="nav-chevron" aria-hidden="true">
                    {expanded ? '▾' : '▸'}
                  </span>
                </button>
              ) : (
                <p className="nav-section">{section.title}</p>
              )}
              <div id={listId} hidden={!expanded}>
                {section.items.map((item) => (
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
