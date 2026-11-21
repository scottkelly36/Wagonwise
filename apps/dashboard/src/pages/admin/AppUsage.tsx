import type {
  ActivityDto,
  FlowsReportDto,
  SiteReportDto,
  UsageFirmDto,
} from '@wagonwise/contracts/usage';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../../components/ErrorNotice';
import * as usageApi from '../../api/usage';
import { DataTable, type Column } from '../../components/DataTable';
import { HomeNote, HomePanel, HomeRows } from '../../components/HomeParts';
import {
  FLOW_STEP_LABELS,
  RETENTION_WEEKS,
  ago,
  flowChoiceRows,
  percentOf,
  seconds,
  versionLabel,
  barHeights,
  cohortShare,
  fromFirstJoin,
  retentionCells,
  shortDay,
  withShare,
} from '../../lib/usage';
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
  compact = false,
}: {
  cells: readonly string[];
  header?: boolean;
  title?: string;
  /** Smaller type and a narrower first column, for a table with many columns on a phone. */
  compact?: boolean;
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
        fontSize: header || compact ? 12 : 14,
        fontVariantNumeric: 'tabular-nums',
        opacity: header ? 0.7 : 1,
      }}
    >
      {cells.map((cell, i) => (
        <span
          key={`${i}-${cell}`}
          role={header ? 'columnheader' : 'cell'}
          style={{
            flex: i === 0 ? `0 0 ${compact ? 56 : 92}px` : 1,
            minWidth: 0,
            textAlign: i === 0 ? 'left' : 'right',
          }}
        >
          {cell}
        </span>
      ))}
    </div>
  );
}

/** How drivers move through planning, from the anonymous flow events: sittings, not drivers (docs/flow-tracking-plan.md). */
function Flows({ flows }: { flows: FlowsReportDto }) {
  const note = (
    <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
      Last {flows.windowDays} days. Counts sittings (one opening of the app), not drivers: a driver
      who plans twice counts twice. Nothing here is linked to a driver. Drivers who turned sharing
      off are not counted.
    </p>
  );
  if (flows.sessions === 0) {
    return (
      <section className="home-panel">
        <h2>Flows</h2>
        <p className="muted">
          No flow events yet. They start once drivers are on the release with flow tracking.
        </p>
        {note}
      </section>
    );
  }
  const first = flows.steps[0]?.sessions ?? 0;
  const choiceRows = flowChoiceRows(flows.choices);
  return (
    <>
      <section className="home-panel">
        <h2>Flows: planning, step by step</h2>
        <HomeRows
          rows={flows.steps.map((step, i) => {
            const before = i === 0 ? null : (flows.steps[i - 1]?.sessions ?? 0);
            return {
              label: FLOW_STEP_LABELS[step.event] ?? step.event,
              value:
                before === null
                  ? String(step.sessions)
                  : `${step.sessions} (${percentOf(step.sessions, before)} of the step before, ${percentOf(step.sessions, first)} of all)`,
              tone: 'quiet' as const,
            };
          })}
        />
        {note}
      </section>
      <section className="home-panel">
        <h2>Flows: time and getting started</h2>
        <HomeRows
          rows={[
            { label: 'Sittings', value: String(flows.sessions), tone: 'quiet' },
            {
              label: 'Opening planning to pressing Plan route (median)',
              value: seconds(flows.medianSeconds.planToPress),
              tone: 'quiet',
            },
            {
              label: 'Seeing the route to starting the trip (median)',
              value: seconds(flows.medianSeconds.routeToStart),
              tone: 'quiet',
            },
            {
              label: 'Walkthrough started',
              value: String(flows.walkthrough.started),
              tone: 'quiet',
            },
            {
              label: 'Walkthrough finished',
              value: String(flows.walkthrough.finished),
              tone: 'quiet',
            },
            {
              label: 'Walkthrough skipped',
              value: String(flows.walkthrough.skipped),
              tone: 'quiet',
            },
            {
              label: '"Still on your trip?" reminders opened',
              value: String(flows.remindersOpened),
              tone: 'quiet',
            },
            {
              label: 'Referral screen opened',
              value: String(flows.referralOpened ?? 0),
              tone: 'quiet',
            },
            {
              label: 'Referral sent to a boss',
              value: String(flows.referralShared ?? 0),
              tone: 'quiet',
            },
          ]}
        />
      </section>
      <section className="home-panel">
        <h2>Flows: choices</h2>
        {choiceRows.length === 0 ? (
          <p className="muted">No choices recorded yet.</p>
        ) : (
          <HomeRows
            rows={choiceRows.map((c) => ({
              label: c.label,
              value: c.value,
              tone: 'quiet' as const,
            }))}
          />
        )}
      </section>
      <section className="home-panel">
        <h2>Flows: by app version</h2>
        <HomeRows
          rows={flows.byVersion.map((v) => ({
            label: versionLabel(v.appVersion, v.updateDate),
            value: `${v.sessions} sittings, ${v.planOpened} opened planning, ${v.tripStarted} started a trip (${percentOf(v.tripStarted, v.planOpened)})`,
            tone: 'quiet' as const,
          }))}
        />
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          The newest five versions seen this week, so a release can be set against the one before.
          The date is the day an over-the-air update was published (the version number only changes
          for a store build); "no date" is the store build's own code, or an app from before 18
          November.
        </p>
      </section>
    </>
  );
}

/** Visits to the website, counted without cookies (docs/modules.md, "Website visits"). */
function Website({ site }: { site: SiteReportDto }) {
  const total = site.views.reduce((sum, v) => sum + v.views, 0);
  const pageName = (page: string) =>
    page === '/' ? 'Home' : page === '/for-hauliers/' ? 'For hauliers' : page.replaceAll('/', '');
  return (
    <>
      <section className="home-panel">
        <h2>Website, last {site.windowDays} days</h2>
        <HomeRows
          rows={[
            { label: 'Page views', value: String(total), tone: 'quiet' },
            ...site.views.map((v) => ({
              label: pageName(v.page),
              value: String(v.views),
              tone: 'quiet' as const,
            })),
            { label: 'Video played', value: String(site.videoPlays), tone: 'quiet' },
          ]}
        />
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          Counted without cookies: a view is one opening of a page, not one person.
        </p>
      </section>
      <section className="home-panel">
        <h2>Where website visits came from</h2>
        {site.sources.length === 0 ? (
          <p className="muted">No visits yet.</p>
        ) : (
          <HomeRows
            rows={site.sources.map((s) => ({
              label: s.source === 'direct' ? 'Typed in or a bookmark' : s.source,
              value: `${s.views} (${percentOf(s.views, total)})`,
              tone: 'quiet' as const,
            }))}
          />
        )}
        {site.campaigns.length === 0 ? null : (
          <>
            <h3 style={{ fontSize: 14, margin: '12px 0 4px' }}>Campaigns</h3>
            <HomeRows
              rows={site.campaigns.map((c) => ({
                label: c.campaign,
                value: String(c.views),
                tone: 'quiet' as const,
              }))}
            />
          </>
        )}
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          A source is a link's utm_source, or the site the visitor came from. Add
          ?utm_source=facebook&amp;utm_campaign=a-name to a link to see it here.
        </p>
      </section>
    </>
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
  const retention = fromFirstJoin(u.retentionByWeek ?? []);
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
          <h2>Do drivers come back?</h2>
          <div
            style={{ marginTop: 8 }}
            role="table"
            aria-label="Share of each week's new drivers who started a trip, week by week"
          >
            <CohortRow
              compact
              header
              cells={[
                'Joined',
                ...Array.from({ length: RETENTION_WEEKS }, (_, k) => `Wk ${k + 1}`),
              ]}
            />
            {retention.length === 0 && (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                No new drivers in the last 8 weeks.
              </p>
            )}
            {retention
              .slice()
              .reverse()
              .map((w) => (
                <CohortRow
                  compact
                  key={w.weekStart}
                  title={`${w.joined} joined in the week of ${shortDay(w.weekStart)}. Started a trip, week by week: ${w.startedTripInWeek.join(', ')}.`}
                  cells={[shortDay(w.weekStart), ...retentionCells(w)]}
                />
              ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Drivers grouped by the week they joined (weeks start on Monday). Each figure is the
            share of them who started at least one trip that week: Wk 1 is the week they joined. The
            last figure in each row is this week, so far. A level line from week 4 on means a core
            of regular drivers; a fall to almost nothing means they tried it and stopped. A week
            with few new drivers swings a lot.
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

      {u.site === undefined ? null : (
        <div className="home-panels" style={{ marginTop: 14 }}>
          <Website site={u.site} />
        </div>
      )}

      {u.flows === undefined ? null : (
        <div className="home-panels" style={{ marginTop: 14 }}>
          <Flows flows={u.flows} />
        </div>
      )}

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
