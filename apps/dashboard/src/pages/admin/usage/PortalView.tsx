import type { UsagePortalDto } from '@wagonwise/contracts/usage';
import { Link } from 'react-router-dom';
import { BarList } from '../../../components/charts/BarList';
import { DataTable, type Column } from '../../../components/DataTable';
import { HomeRows } from '../../../components/HomeParts';
import {
  FORM_LABELS,
  PAGE_LABELS,
  PROBLEM_LABELS,
  fieldLabel,
  secondsText,
  sentText,
  stoppedAt,
} from '../../../lib/portal-usage';
import { ago } from '../../../lib/usage';
import { useUsageSection } from '../../../hooks/use-usage-section';
import { ViewState } from './shared';

type Form = UsagePortalDto['forms'][number];
type Firm = UsagePortalDto['settingUp'][number];

/**
 * How companies use the portal itself, from the pages and form steps their staff trigger (docs/company-account-states-scope.md, "Portal
 * tracking"): which pages are used and which never are, where forms are left or trip people up, and the new firms that have not got as far
 * as a first job. Names only, never what was typed; the company is kept, the person is not.
 */
export function PortalView() {
  const portal = useUsageSection('portal');
  return <ViewState query={portal}>{(p) => <Portal report={p} />}</ViewState>;
}

function Portal({ report }: { report: UsagePortalDto }) {
  const now = new Date(report.generatedAt);
  const pages = report.pages
    .slice()
    .sort((a, b) => b.sessions - a.sessions || a.page.localeCompare(b.page));
  const noData = report.sessions === 0;

  const formColumns: Column<Form>[] = [
    {
      key: 'form',
      header: 'Form',
      sortValue: (f) => FORM_LABELS[f.form],
      cell: (f) => FORM_LABELS[f.form],
    },
    {
      key: 'opened',
      header: 'Opened',
      align: 'right',
      sortValue: (f) => f.opened,
      cell: (f) => f.opened,
    },
    {
      key: 'sent',
      header: 'Sent',
      align: 'right',
      sortValue: (f) => (f.opened === 0 ? 0 : f.sent / f.opened),
      cell: (f) => sentText(f.opened, f.sent),
    },
    {
      key: 'left',
      header: 'Left part-way',
      align: 'right',
      sortValue: (f) => f.left,
      cell: (f) => f.left,
    },
    {
      key: 'errors',
      header: 'Problems shown',
      align: 'right',
      sortValue: (f) => f.errors,
      cell: (f) => f.errors,
    },
    {
      key: 'time',
      header: 'Time to send (median)',
      align: 'right',
      sortValue: (f) => f.medianSecondsToSend ?? -1,
      cell: (f) => secondsText(f.medianSecondsToSend),
    },
  ];

  const firmColumns: Column<Firm>[] = [
    { key: 'name', header: 'Firm', sortValue: (f) => f.name, cell: (f) => f.name },
    {
      key: 'made',
      header: 'Made',
      sortValue: (f) => f.createdAt,
      cell: (f) => ago(f.createdAt, now),
    },
    {
      key: 'stopped',
      header: 'Where it has got to',
      sortValue: (f) => stoppedAt(f),
      cell: (f) => stoppedAt(f),
    },
    {
      key: 'vehicles',
      header: 'Vehicles',
      align: 'right',
      sortValue: (f) => f.vehicles,
      cell: (f) => f.vehicles,
    },
    {
      key: 'drivers',
      header: 'Drivers',
      align: 'right',
      sortValue: (f) => f.drivers,
      cell: (f) => f.drivers,
    },
    {
      key: 'seen',
      header: 'Last in the portal',
      sortValue: (f) => f.lastSeenAt ?? '',
      cell: (f) => ago(f.lastSeenAt, now),
    },
  ];

  return (
    <>
      <div className="home-panels">
        <section className="home-panel">
          <h2>The portal, last {report.windowDays} days</h2>
          <HomeRows
            rows={[
              {
                label: 'Sittings (one opening of the portal)',
                value: String(report.sessions),
                tone: 'quiet',
              },
              { label: 'Firms seen', value: String(report.firms), tone: 'quiet' },
            ]}
          />
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Only a company&apos;s own staff count; WagonWise staff are not tracked. Pages and form
            steps by name, never what anyone typed. Kept 90 days.
            {noData && ' Nothing yet: it starts once firms use the release with tracking.'}
          </p>
        </section>
        <section className="home-panel">
          <h2>Pages, by sittings that opened them</h2>
          <BarList
            label="Sittings that opened each page"
            rows={pages.map((p) => ({
              key: p.page,
              label: PAGE_LABELS[p.page],
              value: p.sessions,
            }))}
          />
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            A page with no bar was not opened at all in this time: a candidate to rethink or to show
            people.
          </p>
        </section>
        <section className="home-panel">
          <h2>Fields that trip people up</h2>
          {report.errorFields.length === 0 ? (
            <p className="muted">No problems shown yet.</p>
          ) : (
            <BarList
              label="Fields with the most problems"
              rows={report.errorFields.map((f) => ({
                key: `${f.form}-${f.field}-${f.problem}`,
                label: `${FORM_LABELS[f.form]}: ${fieldLabel(f.field)}`,
                note: PROBLEM_LABELS[f.problem],
                value: f.count,
              }))}
            />
          )}
        </section>
      </div>

      <h2 className="mt-24">Forms</h2>
      <DataTable
        columns={formColumns}
        rows={report.forms}
        rowKey={(f) => f.form}
        emptyText="No forms tracked yet."
      />
      <p className="muted mt-12">
        &quot;Left part-way&quot; counts a form that had something typed into it and was then left
        without being sent. A form opened and not sent, with no problem shown, is the one to look
        at.
      </p>

      <h2 className="mt-24">Firms still setting up</h2>
      <DataTable
        columns={firmColumns}
        rows={report.settingUp}
        rowKey={(f) => f.id}
        searchText={(f) => f.name}
        emptyText="Every firm made in the last 90 days has a job."
      />
      <p className="muted mt-12">
        Firms made in the last 90 days with no job yet, and when someone from the firm was last in
        the portal: the ones to ring. <Link to="/admin/companies">Open a firm</Link> for its
        account.
      </p>
    </>
  );
}
