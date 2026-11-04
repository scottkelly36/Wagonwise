import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as staffApi from '../api/staff';
import { guideIdForPath, guideSection } from '../lib/guide';
import { useAlerts } from '../lib/use-alerts';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { PopMenu } from './PopMenu';

/** The bar across the top: the menu button on a phone, whose company this is, the bell, the guide, and the account menu. */
export function TopBar({ navOpen, onToggleNav }: { navOpen: boolean; onToggleNav: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const staff = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const signOut = useStaffAuthStore((s) => s.signOut);

  // The company's name comes from the account, once; it does not change while someone is signed in.
  const account = useQuery({
    queryKey: ['staff-me', staff?.id],
    queryFn: () => withAccessToken((t) => staffApi.me(t)),
    enabled: staff !== undefined,
    staleTime: Infinity,
    retry: false,
  });
  const alerts = useAlerts();
  const section = guideSection(guideIdForPath(pathname));

  const company = staff?.kind === 'platform' ? 'WagonWise staff' : account.data?.companyName;

  return (
    <header className="topbar">
      <button
        type="button"
        className="menu-button"
        aria-label={navOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={navOpen}
        aria-controls="main-nav"
        onClick={onToggleNav}
      >
        <span aria-hidden="true">{navOpen ? '✕' : '☰'}</span>
      </button>
      <div className="topbar-company">{company}</div>

      {staff !== undefined && (
        <>
          {alerts.available && <AlertsMenu {...alerts} />}

          <Link
            to={section === undefined ? '/guide' : `/guide/${section.id}`}
            className="topbar-button"
            aria-label={section === undefined ? 'Guide' : `Guide for this page: ${section.title}`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="2" />
              <path
                d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="17" r="1.2" fill="currentColor" />
            </svg>
            <span className="topbar-button-text">Guide</span>
          </Link>

          <PopMenu
            label={`Account menu for ${staff.name}`}
            triggerClassName="topbar-account"
            trigger={
              <>
                <span className="avatar" aria-hidden="true">
                  {staff.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="who" aria-hidden="true">
                  {staff.name}
                  <small>{staff.kind === 'platform' ? 'WagonWise staff' : staff.email}</small>
                </span>
                <span className="nav-chevron" aria-hidden="true">
                  ▾
                </span>
              </>
            }
            header={
              <>
                <strong>{staff.name}</strong>
                <small>{staff.email}</small>
              </>
            }
          >
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="popmenu-item"
              onClick={() => {
                void signOut().then(() => navigate('/staff/sign-in'));
              }}
            >
              Sign out
            </button>
          </PopMenu>
        </>
      )}
    </header>
  );
}

function AlertsMenu({ alerts, loading }: ReturnType<typeof useAlerts>) {
  const red = alerts.some((a) => a.tone === 'bad');
  return (
    <PopMenu
      label={
        alerts.length === 0
          ? 'Alerts: nothing needs you'
          : `Alerts: ${alerts.length} ${alerts.length === 1 ? 'thing needs' : 'things need'} you`
      }
      triggerClassName="topbar-button topbar-bell"
      trigger={
        <>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          {alerts.length > 0 && (
            <span className={red ? 'bell-count bell-count-bad' : 'bell-count'} aria-hidden="true">
              {alerts.length}
            </span>
          )}
        </>
      }
      header={
        <strong>
          {loading
            ? 'Checking…'
            : alerts.length === 0
              ? 'Nothing needs you right now'
              : 'Needs you now'}
        </strong>
      }
    >
      {alerts.length === 0
        ? undefined
        : alerts.map((alert) => (
            <Link
              key={alert.key}
              to={alert.to}
              role="menuitem"
              tabIndex={-1}
              className="popmenu-item popmenu-alert"
              data-tone={alert.tone}
            >
              <span>{alert.title}</span>
              {alert.detail !== undefined && alert.detail !== '' && <small>{alert.detail}</small>}
            </Link>
          ))}
    </PopMenu>
  );
}
