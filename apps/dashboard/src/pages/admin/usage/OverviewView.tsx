import { BarList } from '../../../components/charts/BarList';
import { HomePanel, HomeRows } from '../../../components/HomeParts';
import { percentOf, withShare } from '../../../lib/usage';
import { activityRows } from './activity-rows';
import { useUsageSection } from '../../../hooks/use-usage-section';
import { ViewState } from './shared';

/** The headline figures: who uses the app, how far drivers get, and how many firms. The view the page opens on. */
export function OverviewView() {
  const overview = useUsageSection('overview');
  return (
    <ViewState query={overview}>
      {(u) => (
        <>
          <div className="home-panels">
            <HomePanel title="Drivers" area="ops" to="/admin/companies" linkLabel="Companies">
              <HomeRows
                rows={[
                  ...activityRows(u.drivers),
                  {
                    label: 'Deleted accounts (not counted above)',
                    value: String(u.deletedDrivers),
                    tone: 'quiet' as const,
                  },
                ]}
              />
            </HomePanel>
            <HomePanel title="Office staff" area="ops" to="/admin/companies" linkLabel="Companies">
              <HomeRows rows={activityRows(u.staff)} />
            </HomePanel>
            <HomePanel
              title="Firms and phones"
              area="admin"
              to="/admin/testers"
              linkLabel="Testers"
            >
              <HomeRows
                rows={[
                  { label: 'Firms', value: String(u.firms.total), tone: 'quiet' },
                  {
                    label: 'Firms used this week',
                    value: String(u.firms.activeThisWeek),
                    tone: 'quiet',
                  },
                  { label: 'Phones set up for alerts', value: String(u.devices), tone: 'quiet' },
                  { label: 'Trips started today', value: String(u.tripsToday), tone: 'quiet' },
                  { label: 'Trips running now', value: String(u.tripsRunningNow), tone: 'quiet' },
                  { label: 'People waiting to test', value: String(u.testers), tone: 'quiet' },
                ]}
              />
            </HomePanel>
          </div>

          <div className="home-panels" style={{ marginTop: 14 }}>
            <section className="home-panel">
              <h2>Where drivers get to</h2>
              <BarList
                label="How far drivers have got"
                whole={u.funnel.accounts}
                rows={[
                  ['accounts', 'Made an account', u.funnel.accounts],
                  ['signedIn', 'Signed in', u.funnel.signedIn],
                  ['hasVehicle', 'Chose a vehicle', u.funnel.hasVehicle],
                  ['plannedRoute', 'Planned a route', u.funnel.plannedRoute],
                  ['startedTrip', 'Started a trip', u.funnel.startedTrip],
                  ['twoDays', 'Drove on two different days', u.funnel.startedTripOnTwoDays],
                ].map(([key, label, value]) => ({
                  key: String(key),
                  label: String(label),
                  value: Number(value),
                  text:
                    key === 'accounts'
                      ? String(value)
                      : `${value} (${percentOf(Number(value), u.funnel.accounts)})`,
                }))}
              />
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                Different drivers, not trips. Test accounts count. Trips are kept for 30 days.{' '}
                {withShare(u.funnel.startedTrip, u.funnel.accounts)} of accounts have started a
                trip.
              </p>
            </section>
          </div>
        </>
      )}
    </ViewState>
  );
}
