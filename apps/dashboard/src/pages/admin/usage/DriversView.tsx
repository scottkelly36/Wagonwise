import { ColumnChart } from '../../../components/charts/ColumnChart';
import { HeatGrid } from '../../../components/charts/HeatGrid';
import {
  RETENTION_WEEKS,
  cohortShare,
  fromFirstJoin,
  retentionCells,
  shortDay,
} from '../../../lib/usage';
import { CohortRow } from './CohortRow';
import { useUsageSection } from '../../../hooks/use-usage-section';
import { ViewState } from './shared';

/** New drivers and whether they come back. */
export function DriversView() {
  const drivers = useUsageSection('drivers');
  return (
    <ViewState query={drivers}>
      {(u) => {
        const newDrivers = fromFirstJoin(u.newDriversByDay);
        const retention = fromFirstJoin(u.retentionByWeek);
        return (
          <div className="home-panels">
            <section className="home-panel">
              <h2>New drivers, by the day they joined</h2>
              <ColumnChart
                label="New drivers per day"
                points={u.newDriversByDay.map((d) => ({ key: d.day, count: d.joined }))}
                format={shortDay}
              />
              <div
                style={{ marginTop: 12 }}
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
                after a change to the app with the days before it. A day with few drivers swings a
                lot.
              </p>
            </section>
            <section className="home-panel">
              <h2>Do drivers come back?</h2>
              {retention.length === 0 ? (
                <p className="muted" style={{ margin: '8px 0 0' }}>
                  No new drivers in the last 8 weeks.
                </p>
              ) : (
                <HeatGrid
                  label="Share of each week's new drivers who started a trip, week by week"
                  columns={Array.from({ length: RETENTION_WEEKS }, (_, k) => `Wk ${k + 1}`)}
                  rows={retention
                    .slice()
                    .reverse()
                    .map((w) => {
                      const texts = retentionCells(w);
                      return {
                        key: w.weekStart,
                        label: shortDay(w.weekStart),
                        title: `${w.joined} joined in the week of ${shortDay(w.weekStart)}. Started a trip, week by week: ${w.startedTripInWeek.join(', ')}.`,
                        cells: texts.map((t, k) =>
                          w.joined > 0 && w.startedTripInWeek[k] !== undefined
                            ? (w.startedTripInWeek[k] ?? 0) / w.joined
                            : t === ''
                              ? null
                              : 0,
                        ),
                        texts,
                      };
                    })}
                />
              )}
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                Drivers grouped by the week they joined (weeks start on Monday). Each figure is the
                share of them who started at least one trip that week: Wk 1 is the week they joined,
                and the last figure in each row is this week, so far. A steady colour from week 4 on
                means a core of regular drivers; a fade to almost nothing means they tried it and
                stopped. A week with few new drivers swings a lot.
              </p>
            </section>
          </div>
        );
      }}
    </ViewState>
  );
}
