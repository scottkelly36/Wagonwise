import type { ActivityDto, UsageFirmDto } from '@wagonwise/contracts/usage';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as usageApi from '../../api/usage';
import { DataTable, type Column } from '../../components/DataTable';
import { HomeNote, HomePanel, HomeRows } from '../../components/HomeParts';
import { ago, barHeights, shortDay } from '../../lib/usage';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const MINUTE = 60_000;

/** A row of bars, one per day or week, with the first and last labelled. */
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
        aria-label={label}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }}
      >
        {points.map((p, i) => (
          <div
            key={p.key}
            title={`${format(p.key)}: ${p.count}`}
            style={{
              flex: 1,
              minHeight: 2,
              height: `${Math.max(heights[i] ?? 0, 3)}%`,
              background: 'var(--blue-600)',
              opacity: p.count === 0 ? 0.25 : 1,
              borderRadius: 2,
            }}
          />
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
        <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(usage.error)}</p>
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
              { label: 'Trips running now', value: String(u.tripsRunningNow), tone: 'quiet' },
              { label: 'People waiting to test', value: String(u.testers.total), tone: 'quiet' },
            ]}
          />
        </HomePanel>
      </div>

      <div className="home-panels" style={{ marginTop: 14 }}>
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

      <h2 style={{ marginTop: 24 }}>Firms</h2>
      <DataTable
        columns={columns}
        rows={u.firmList}
        rowKey={(f) => f.id}
        searchText={(f) => f.name}
        emptyText="No firms yet."
      />
      <p className="muted" style={{ marginTop: 12 }}>
        Updated {ago(u.generatedAt, new Date())}. <Link to="/admin/companies">Open a firm</Link> to
        see its detail.
      </p>
    </div>
  );
}
