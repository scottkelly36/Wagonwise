import type { JobReportRowDto } from '@wagonwise/contracts/jobs';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import * as jobsApi from '../../api/jobs';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import {
  csvFileName,
  customRange,
  dateTimeText,
  PRESET_LABELS,
  moneyText,
  presetRange,
  revenueBy,
  statusText,
  toCsv,
  type ReportPreset,
  type ReportRange,
} from '../../lib/job-report';
import { formatDuration } from '../../lib/live-map';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const PRESETS = Object.keys(PRESET_LABELS) as ReportPreset[];

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const columns: readonly Column<JobReportRowDto>[] = [
  {
    key: 'reference',
    header: 'Job',
    cell: (r) => r.reference,
    sortValue: (r) => r.reference,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => statusText(r.status),
    sortValue: (r) => r.status,
  },
  {
    key: 'route',
    header: 'From, to',
    cell: (r) => `${r.pickup ?? '?'} → ${r.delivery ?? '?'}`,
  },
  {
    key: 'driver',
    header: 'Driver',
    cell: (r) => r.driver ?? '',
    sortValue: (r) => r.driver ?? '',
  },
  {
    key: 'vehicle',
    header: 'Vehicle',
    cell: (r) => r.vehicle ?? '',
    sortValue: (r) => r.vehicle ?? '',
  },
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) => r.customer ?? '',
    sortValue: (r) => r.customer ?? '',
  },
  {
    key: 'price',
    header: 'Price',
    align: 'right',
    cell: (r) => moneyText(r.pricePence),
    sortValue: (r) => r.pricePence ?? -1,
  },
  {
    key: 'created',
    header: 'Created',
    cell: (r) => dateTimeText(r.createdAt),
    sortValue: (r) => r.createdAt ?? '',
  },
  {
    key: 'delivered',
    header: 'Delivered',
    cell: (r) => dateTimeText(r.deliveredAt),
    sortValue: (r) => r.deliveredAt ?? '',
  },
  {
    key: 'time',
    header: 'Time taken',
    cell: (r) =>
      r.minutesAcceptedToDelivered === undefined
        ? ''
        : formatDuration(r.minutesAcceptedToDelivered),
    sortValue: (r) => r.minutesAcceptedToDelivered ?? null,
    align: 'right',
  },
  {
    key: 'onTime',
    header: 'On time',
    cell: (r) => (r.onTime === undefined ? '' : r.onTime ? 'Yes' : 'Late'),
    sortValue: (r) => (r.onTime === undefined ? '' : r.onTime ? 'Yes' : 'Late'),
  },
  {
    key: 'proof',
    header: 'Proof photo',
    cell: (r) => (r.requiresProofOfDelivery ? (r.hasProofOfDelivery ? 'Received' : 'Missing') : ''),
  },
];

/**
 * Reports (P2-M8): the jobs with any activity in a chosen period, a summary, and a spreadsheet to
 * download. Needs the `view_reports` privilege, which core checks (this page just does not offer
 * itself otherwise). The period is worked out in the viewer's own time zone, so "this month" means
 * their month.
 */
export function Reports() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const allowed = everyCompany || holds(me, 'view_reports');

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;

  const [preset, setPreset] = useState<ReportPreset>('last30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range: ReportRange | undefined = useMemo(
    () =>
      preset === 'custom' ? customRange(customFrom, customTo) : presetRange(preset, new Date()),
    [preset, customFrom, customTo],
  );

  const report = useQuery({
    queryKey: ['job-report', companyId, range?.from.toISOString(), range?.to.toISOString()],
    queryFn: () =>
      withAccessToken((token) =>
        jobsApi.jobReport(token, companyId as string, {
          from: (range as ReportRange).from.toISOString(),
          to: (range as ReportRange).to.toISOString(),
        }),
      ),
    enabled: allowed && companyId !== undefined && range !== undefined,
  });

  if (!allowed) {
    return (
      <div>
        <h1>Reports</h1>
        <p className="muted">
          Reports need the “view reports” permission. Ask a user manager at your company to add it
          to your account.
        </p>
      </div>
    );
  }

  const summary = report.data?.summary;
  const rows = report.data?.rows ?? [];

  return (
    <div>
      <h1>Reports</h1>
      <p className="muted">
        Jobs with any activity in the period: created, assigned, accepted, delivered or finished.
        Times are in your time zone.
      </p>

      <div className="report-filters">
        {everyCompany && (
          <label>
            Company{' '}
            <CompanySelect
              id="report-company"
              value={selectedCompanyId}
              onChange={setSelectedCompanyId}
              emptyLabel="— choose a company —"
            />
          </label>
        )}
        <label>
          Period{' '}
          <select value={preset} onChange={(e) => setPreset(e.target.value as ReportPreset)}>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <label>
              From{' '}
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              To{' '}
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        )}
        <button
          className="btn-primary"
          type="button"
          disabled={range === undefined || rows.length === 0}
          onClick={() => range && download(csvFileName(range), toCsv(rows))}
        >
          Download CSV
        </button>
      </div>

      {preset === 'custom' && range === undefined && (
        <p className="muted">Choose a start and an end date (the end can be the same day).</p>
      )}
      {everyCompany && companyId === undefined && <p className="muted">Choose a company.</p>}
      {report.error !== null && <p className="error">{staffErrorMessage(report.error)}</p>}
      {report.isPending && companyId !== undefined && range !== undefined && <p>Loading…</p>}

      {summary !== undefined && (
        <div className="report-stats" data-testid="report-summary">
          <Stat label="Jobs in the period" value={String(summary.total)} />
          <Stat label="Delivered" value={String(summary.delivered)} />
          <Stat
            label="Delivered on time"
            value={
              summary.deliveredOnTime + summary.deliveredLate === 0
                ? '–'
                : `${Math.round((summary.deliveredOnTime / (summary.deliveredOnTime + summary.deliveredLate)) * 100)}%`
            }
            note={
              summary.deliveredLate > 0
                ? `${summary.deliveredLate} late`
                : 'of those with a due time'
            }
          />
          <Stat
            label="Average time taken"
            value={
              summary.averageMinutes === undefined ? '–' : formatDuration(summary.averageMinutes)
            }
            note="accepted to delivered"
          />
          <Stat label="Cancelled or failed" value={String(summary.cancelled + summary.failed)} />
          <Stat label="Still in progress" value={String(summary.inProgress)} />
          <Stat
            label="Revenue"
            value={moneyText(summary.revenuePence)}
            note={
              summary.deliveredWithoutPrice > 0
                ? `${summary.deliveredWithoutPrice} delivered without a price`
                : 'jobs delivered in the period'
            }
          />
          {summary.proofRequired > 0 && (
            <Stat
              label="Proof photos"
              value={`${summary.proofReceived} of ${summary.proofRequired}`}
              note="where one was required"
            />
          )}
        </div>
      )}

      {report.data !== undefined &&
        range !== undefined &&
        summary !== undefined &&
        summary.delivered > 0 && (
          <div className="report-revenue">
            <RevenueTable title="Revenue by customer" lines={revenueBy(rows, range, 'customer')} />
            <RevenueTable title="Revenue by vehicle" lines={revenueBy(rows, range, 'vehicle')} />
          </div>
        )}

      {report.data !== undefined && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.jobId}
          searchText={(r) =>
            [r.reference, r.pickup, r.delivery, r.driver, r.vehicle, statusText(r.status)]
              .filter(Boolean)
              .join(' ')
          }
          emptyText="No jobs in this period."
        />
      )}
    </div>
  );
}

function RevenueTable({ title, lines }: { title: string; lines: ReturnType<typeof revenueBy> }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'right' }}>Jobs</th>
            <th style={{ textAlign: 'right' }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.name}>
              <td>{line.name}</td>
              <td style={{ textAlign: 'right' }}>{line.jobs}</td>
              <td style={{ textAlign: 'right' }}>{moneyText(line.revenuePence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="report-stat">
      <div className="report-stat-value">{value}</div>
      <div className="report-stat-label">{label}</div>
      {note !== undefined && <div className="report-stat-note muted">{note}</div>}
    </div>
  );
}
