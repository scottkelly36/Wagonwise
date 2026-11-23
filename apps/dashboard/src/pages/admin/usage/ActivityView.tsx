import { ColumnChart } from '../../../components/charts/ColumnChart';
import { shortDay } from '../../../lib/usage';
import { useUsageSection } from '../../../hooks/use-usage-section';
import { ViewState } from './shared';

const week = (key: string) => `w/c ${shortDay(key)}`;

/** Trips, jobs and checks over the last weeks. */
export function ActivityView() {
  const activity = useUsageSection('activity');
  return (
    <ViewState query={activity}>
      {(u) => (
        <div className="home-panels">
          <section className="home-panel">
            <h2>Trips started, last 14 days</h2>
            <ColumnChart
              label="Trips started per day"
              points={u.tripsPerDay.map((d) => ({ key: d.day, count: d.count }))}
              format={shortDay}
            />
          </section>
          <section className="home-panel">
            <h2>Jobs created, last 8 weeks</h2>
            <ColumnChart
              label="Jobs created per week"
              points={u.jobsCreatedPerWeek.map((w) => ({ key: w.weekStart, count: w.count }))}
              format={week}
            />
          </section>
          <section className="home-panel">
            <h2>Jobs delivered, last 8 weeks</h2>
            <ColumnChart
              label="Jobs delivered per week"
              points={u.jobsDeliveredPerWeek.map((w) => ({ key: w.weekStart, count: w.count }))}
              format={week}
            />
          </section>
          <section className="home-panel">
            <h2>Vehicle checks, last 8 weeks</h2>
            <ColumnChart
              label="Vehicle checks per week"
              points={u.checksPerWeek.map((w) => ({ key: w.weekStart, count: w.count }))}
              format={week}
            />
          </section>
        </div>
      )}
    </ViewState>
  );
}
