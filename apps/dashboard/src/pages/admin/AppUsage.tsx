import type { ActivityDto, UsageFirmDto } from '@wagonwise/contracts/usage';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../../components/ErrorNotice';
import * as usageApi from '../../api/usage';
import { DataTable, type Column } from '../../components/DataTable';
import { HomeNote, HomePanel, HomeRows } from '../../components/HomeParts';
import { ago, barHeights, cohortShare, fromFirstJoin, shortDay, withShare } from '../../lib/usage';
import { useStaffAuthStore } from '../../state/staff-auth-store';

const MINUTE = 60_000;

/** A row of bars, one per day or week, each with its number above it and the first and last labelled. */
function Bars({
  label,
  points,
  format,
}: {
  label: string;
  points: readonly { key: string; count: number }[];
  format: (key: string) => string;
}) {
  const heights = barHeights(points.map((p) => p.count));
  return (
    <div style={{ marginTop: 10 }}>
      <div
        role="img"
        aria-label={`${label}: ${points.map((p) => `${format(p.key)} ${p.count}`).join(', ')}`}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 82 }}
      >
        {points.map((p, i) => (
          <div
            key={p.key}
            title={`${format(p.key)}: ${p.count}`}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <span
              className={p.count === 0 ? 'muted' : undefined}
              style={{ fontSize: 11, lineHeight: '14px', fontVariantNumeric: 'tabular-nums' }}
            >
              {p.count}
            </span>
            <div
              style={{
                width: '100%',
                height: Math.max(Math.round((heights[i] ?? 0) * 0.64), 2),
                background: 'var(--blue-600)',
                opacity: p.count === 0 ? 0.25 : 1,
                borderRadius: 2,
              }}
            />
          </div>
        ))}
      </div>
      <div
        className="muted"
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
      >
        <span>{points[0] === undefined ? '' : format(points[0].key)}</span>
        <span>{points.reduce((sum, p) => sum + p.count, 0)} in all</span>
        <span>{points.length === 0 ? '' : format(points[points.length - 1]?.key ?? '')}</span>
      </div>
    </div>
  );
}

/** One line of the new-drivers table: a day, how many joined, and the share who chose a vehicle, planned a route and started a trip. */
function CohortRow({
  cells,
  header = false,
  title,
}: {
  cells: readonly string[];
  header?: boolean;
  title?: string;
}) {
  return (
    <div
      role="row"
      title={title}
      style={{
        display: 'flex',
        gap: 8,
        padding: '5px 0',
        borderTop: header ? undefined : '1px solid var(--line, rgba(128,128,128,0.2))',
        fontSize: header ? 12 : 14,
        fontVariantNumeric: 'tabular-nums',
        opacity: header ? 0.7 : 1,
      }}
    >
      {cells.map((cell, i) => (
        <span
          key={`${i}-${cell}`}
          role={header ? 'columnheader' : 'cell'}
          style={{ flex: i === 0 ? '0 0 92px' : 1, textAlign: i === 0 ? 'left' : 'right' }}
        >
          {cell}
        </span>
      ))}
    </div>
  );
}

const activityRows = (a: ActivityDto) =>
  [
    { label: 'Accounts', value: String(a.total), tone: 'quiet' as const },
    { label: 'Used in the last day', value: String(a.active24h), tone: 'quiet' as const },
    { label: 'Used in the last week', value: String(a.active7d), tone: 'quiet' as const },
    { label: 'Used in the last month', value: String(a.active30d), tone: 'quiet' as const },
    {
      label: 'Never signed in',
      value: String(a.neverSignedIn),
      tone: a.neverSignedIn === 0 ? ('quiet' as const) : ('warn' as const),
    },
  ] as const;

/** How the app is being used: people, firms and activity. Counts only. WagonWise staff only. */
export function AppUsage() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const usage = useQuery({
    queryKey: ['usage'],
    queryFn: () => withAccessToken((token) => usageApi.getUsage(token)),
    refetchInterval: 5 * MINUTE,
  });

  if (usage.isError) {
    return (
      <div>
        <h1>App usage</h1>
        <ErrorNotice error={usage.error} />
      </div>
    );
  }
  if (usage.data === undefined) {
    return (
      <div>
        <h1>App usage</h1>
        <HomeNote>Loading…</HomeNote>
      </div>
    );
  }

  const u = usage.data;
  const newDrivers = fromFirstJoin(u.newDriversByDay);
  const now = new Date(u.generatedAt);
  const columns: Column<UsageFirmDto>[] = [
    { key: 'name', header: 'Firm', sortValue: (f) => f.name, cell: (f) => f.name },
    {
      key: 'drivers',
      header: 'Drivers',
      align: 'right',
      sortValue: (f) => f.drivers,
      cell: (f) => f.drivers,
    },
    {
      key: 'vehicles',
      header: 'Vehicles',
      align: 'right',
      sortValue: (f) => f.vehicles,
      cell: (f) => f.vehicles,
    },
    {
      key: 'staff',
      header: 'Office staff',
      align: 'right',
      sortValue: (f) => f.staff,
      cell: (f) => f.staff,
    },
    {
      key: 'jobs',
      header: 'Jobs this month',
      align: 'right',
      sortValue: (f) => f.jobsThisMonth,
      cell: (f) => f.jobsThisMonth,
    },
    {
      key: 'last',
      header: 'Last used',
      sortValue: (f) => f.lastActiveAt ?? '',
      cell: (f) => ago(f.lastActiveAt, now),
    },
  ];

  return (
    <div>
      <h1>App usage</h1>
      <p className="muted">
        Counts only: no driver is named. &quot;Used&quot; means they signed in or the app renewed
        their sign-in in that time, so it is a little behind for someone who keeps the app open.
      </p>

      <div className="home-panels">
        <HomePanel title="Drivers" area="ops" to="/admin/companies" linkLabel="Companies">
          <HomeRows rows={activityRows(u.drivers)} />
        </HomePanel>
        <HomePanel title="Office staff" area="ops" to="/admin/companies" linkLabel="Companies">
          <HomeRows rows={activityRows(u.staff)} />
        </HomePanel>
        <HomePanel title="Firms and phones" area="admin" to="/admin/testers" linkLabel="Testers">
          <HomeRows
            rows={[
              { label: 'Firms', value: String(u.firms.total), tone: 'quiet' },
              {
                label: 'Firms used this week',
                value: String(u.firms.activeThisWeek),
                tone: 'quiet',
              },
              { label: 'Phones set up for alerts', value: String(u.devices.total), tone: 'quiet' },
              {
                label: 'Trips started today',
                value: String(u.tripsPerDay[u.tripsPerDay.length - 1]?.count ?? 0),
                tone: 'quiet',
              },
              { label: 'Trips running now', value: String(u.tripsRunningNow), tone: 'quiet' },
              { label: 'People waiting to test', value: String(u.testers.total), tone: 'quiet' },
            ]}
          />
        </HomePanel>
      </div>

      <div className="home-panels" style={{ marginTop: 14 }}>
        <section className="home-panel">
          <h2>Where drivers get to</h2>
          <HomeRows
            rows={[
              { label: 'Made an account', value: String(u.funnel.accounts), tone: 'quiet' },
              {
                label: 'Signed in',
                value: withShare(u.funnel.signedIn, u.funnel.accounts),
                tone: 'quiet',
              },
              {
                label: 'Chose a vehicle',
                value: withShare(u.funnel.hasVehicle, u.funnel.accounts),
                tone: 'quiet',
              },
              {
                label: 'Planned a route',
                value: withShare(u.funnel.plannedRoute, u.funnel.accounts),
                tone: 'quiet',
              },
              {
                label: 'Started a trip',
                value: withShare(u.funnel.startedTrip, u.funnel.accounts),
                tone: 'quiet',
              },
              {
                label: 'Drove on two different days',
                value: withShare(u.funnel.startedTripOnTwoDays, u.funnel.accounts),
                tone: 'quiet',
              },
            ]}
          />
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Different drivers, not trips. Test accounts count. Trips are kept for 30 days.
          </p>
        </section>
        <section className="home-panel">
          <h2>New drivers, by the day they joined</h2>
          <div
            style={{ marginTop: 8 }}
            role="table"
            aria-label="New drivers by the day they joined"
          >
            <CohortRow cells={['Joined', 'Drivers', 'Vehicle', 'Route', 'Trip']} header />
            {newDrivers.length === 0 && (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                No new drivers in the last 14 days.
              </p>
            )}
            {newDrivers
              .slice()
              .reverse()
              .map((d, i) => (
                <CohortRow
                  key={d.day}
                  title={`${d.joined} joined. Chose a vehicle: ${d.hasVehicle}. Planned a route: ${d.plannedRoute}. Started a trip: ${d.startedTrip}.`}
                  cells={[
                    i === 0 ? `${shortDay(d.day)} (today)` : shortDay(d.day),
                    String(d.joined),
                    cohortShare(d.hasVehicle, d.joined),
                    cohortShare(d.plannedRoute, d.joined),
                    cohortShare(d.startedTrip, d.joined),
                  ]}
                />
              ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            The share of each day&apos;s new drivers who have got that far so far. Compare days
            after a change to the app with the days before it. A day with few drivers swings a lot.
          </p>
        </section>
        <section className="home-panel">
          <h2>Trips started, last 14 days</h2>
          <Bars
            label="Trips started per day"
            points={u.tripsPerDay.map((d) => ({ key: d.day, count: d.count }))}
            format={shortDay}
          />
        </section>
        <section className="home-panel">
          <h2>Jobs created, last 8 weeks</h2>
          <Bars
            label="Jobs created per week"
            points={u.jobsCreatedPerWeek.map((w) => ({ key: w.weekStart, count: w.count }))}
            format={(k) => `w/c ${shortDay(k)}`}
          />
        </section>
        <section className="home-panel">
          <h2>Jobs delivered, last 8 weeks</h2>
          <Bars
            label="Jobs delivered per week"
            points={u.jobsDeliveredPerWeek.map((w) => ({ key: w.weekStart, count: w.count }))}
            format={(k) => `w/c ${shortDay(k)}`}
          />
        </section>
        <section className="home-panel">
          <h2>Vehicle checks, last 8 weeks</h2>
          <Bars
            label="Vehicle checks per week"
            points={u.checksPerWeek.map((w) => ({ key: w.weekStart, count: w.count }))}
            format={(k) => `w/c ${shortDay(k)}`}
          />
        </section>
      </div>

      <h2 className="mt-24">Firms</h2>
      <DataTable
        columns={columns}
        rows={u.firmList}
        rowKey={(f) => f.id}
        searchText={(f) => f.name}
        emptyText="No firms yet."
      />
      <p className="muted mt-12">
        Updated {ago(u.generatedAt, new Date())}. <Link to="/admin/companies">Open a firm</Link> to
        see its detail.
      </p>
    </div>
  );
}
