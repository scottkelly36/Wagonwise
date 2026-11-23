import { useSearchParams } from 'react-router-dom';
import { Seg } from '../../components/Seg';
import { ActivityView } from './usage/ActivityView';
import { DriversView } from './usage/DriversView';
import { FirmsView } from './usage/FirmsView';
import { FlowsView } from './usage/FlowsView';
import { OverviewView } from './usage/OverviewView';
import { PortalView } from './usage/PortalView';
import { SiteView } from './usage/SiteView';

const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'activity', label: 'Trips and jobs' },
  { key: 'firms', label: 'Firms' },
  { key: 'portal', label: 'Portal' },
  { key: 'flows', label: 'App flows' },
  { key: 'site', label: 'Website' },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

const isView = (value: string | null): value is ViewKey => VIEWS.some((v) => v.key === value);

/**
 * How the app and the portal are being used: counts only, WagonWise staff only. One view at a time, and only the open view asks the server
 * for its figures, so the page opens quickly and a view already looked at comes back at once. The view is in the address
 * (`?view=portal`), so a link or a reload lands on the same one.
 */
export function AppUsage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('view');
  const view: ViewKey = isView(asked) ? asked : 'overview';

  return (
    <div>
      <h1>Usage</h1>
      <p className="muted">
        Counts only: no driver is named. &quot;Used&quot; means they signed in or the app renewed
        their sign-in in that time, so it is a little behind for someone who keeps the app open.
      </p>

      <div className="usage-tabs seg-scroll">
        <Seg
          ariaLabel="What to look at"
          options={VIEWS}
          value={view}
          onChange={(key) => setParams(key === 'overview' ? {} : { view: key }, { replace: true })}
        />
      </div>

      {view === 'overview' && <OverviewView />}
      {view === 'drivers' && <DriversView />}
      {view === 'activity' && <ActivityView />}
      {view === 'firms' && <FirmsView />}
      {view === 'portal' && <PortalView />}
      {view === 'flows' && <FlowsView />}
      {view === 'site' && <SiteView />}
    </div>
  );
}
