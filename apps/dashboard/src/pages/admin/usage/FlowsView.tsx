import type { FlowsReportDto } from '@wagonwise/contracts/usage';
import { BarList } from '../../../components/charts/BarList';
import { HomeRows } from '../../../components/HomeParts';
import {
  FLOW_STEP_LABELS,
  flowChoiceRows,
  percentOf,
  seconds,
  versionLabel,
} from '../../../lib/usage';
import { useUsageSection } from '../../../hooks/use-usage-section';
import { ViewState } from './shared';

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
        <h2>Nothing yet</h2>
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
        <h2>Planning, step by step</h2>
        <BarList
          label="Sittings that reached each planning step"
          whole={first}
          rows={flows.steps.map((step, i) => {
            const before = i === 0 ? null : (flows.steps[i - 1]?.sessions ?? 0);
            return {
              key: step.event,
              label: FLOW_STEP_LABELS[step.event] ?? step.event,
              value: step.sessions,
              text: String(step.sessions),
              note:
                before === null
                  ? undefined
                  : `${percentOf(step.sessions, before)} of the step before, ${percentOf(step.sessions, first)} of all`,
            };
          })}
        />
        {note}
      </section>
      <section className="home-panel">
        <h2>Time and getting started</h2>
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
        <h2>Choices</h2>
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
        <h2>By app version</h2>
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

export function FlowsView() {
  const flows = useUsageSection('flows');
  return (
    <ViewState query={flows}>
      {(data) => (
        <div className="home-panels">
          <Flows flows={data} />
        </div>
      )}
    </ViewState>
  );
}
