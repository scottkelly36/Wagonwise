import type {
  CostReportDto,
  CustomerCostDto,
  JobCostDto,
  JobCostNote,
  VehicleCostDto,
} from '@wagonwise/contracts/costing';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as costingApi from '../../api/costing';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import { dateTimeText } from '../../lib/job-report';
import { formatPence, ukToday } from '../../lib/money';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const NOTE_TEXT: Record<JobCostNote, string> = {
  no_price: 'no price',
  no_time: 'no time on the job',
  no_rate: 'driver has no rate',
  no_driver: 'no driver',
  no_vehicle: 'no vehicle',
};

const profitStyle = (pence: number | undefined) =>
  pence === undefined
    ? undefined
    : { color: pence < 0 ? 'var(--danger)' : 'var(--btn-confirm-fg)', fontWeight: 600 };

const money = (pence: number | undefined): string =>
  pence === undefined ? '–' : formatPence(pence);

/**
 * Job profit: what each job delivered in a month cost and made, and the same by vehicle and by customer. It works from the
 * price on each job, the fuel imported, the running costs and what each driver costs an hour. It reads wages, so it needs
 * `manage_billing`. Nothing here is guessed: a job with no price has no profit, and a driver with no rate adds no wages and the
 * job says so.
 */
export function JobCosts() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const everyCompany = isPlatform(me);
  const allowed = everyCompany || holds(me, 'manage_billing');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const [month, setMonth] = useState(ukToday().slice(0, 7));

  return (
    <div>
      <h1>Job profit</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        What each job cost and made, by job, vehicle and customer. Prices come from the jobs, fuel
        from the Fuel page, and running costs and driver rates from Running costs and pay.
      </p>
      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="jobcosts-company">Company </label>
          <CompanySelect
            id="jobcosts-company"
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            emptyLabel="Choose a company"
          />
        </div>
      )}
      {!allowed ? (
        <p>Only the person who looks after your money can see this page.</p>
      ) : companyId === undefined ? (
        <p>Choose a company.</p>
      ) : (
        <>
          <label style={{ display: 'block', marginBottom: 16 }}>
            Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <Report companyId={companyId} month={month} />
        </>
      )}
    </div>
  );
}

function Report({ companyId, month }: { companyId: string; month: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const report = useQuery({
    queryKey: ['job-costs', companyId, month],
    queryFn: () => withAccessToken((t) => costingApi.getJobCosts(t, companyId, month)),
    enabled: /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    retry: false,
  });
  if (report.isPending) return <p>Loading…</p>;
  if (report.isError) return <p className="error">{staffErrorMessage(report.error)}</p>;
  return <ReportBody report={report.data} />;
}

function ReportBody({ report }: { report: CostReportDto }) {
  const t = report.totals;
  const jobColumns: Column<JobCostDto>[] = [
    { key: 'ref', header: 'Job', sortValue: (j) => j.reference, cell: (j) => j.reference },
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (j) => j.customer ?? '',
      cell: (j) => j.customer ?? '',
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      sortValue: (j) => j.vehicleName ?? '',
      cell: (j) => j.vehicleName ?? '',
    },
    {
      key: 'driver',
      header: 'Driver',
      sortValue: (j) => j.driverName ?? '',
      cell: (j) => j.driverName ?? '',
    },
    {
      key: 'delivered',
      header: 'Delivered',
      sortValue: (j) => j.deliveredAt,
      cell: (j) => dateTimeText(j.deliveredAt),
    },
    {
      key: 'hours',
      header: 'Hours',
      align: 'right',
      sortValue: (j) => j.hours,
      cell: (j) => j.hours.toFixed(1),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortValue: (j) => j.pricePence ?? -1,
      cell: (j) => money(j.pricePence),
    },
    {
      key: 'wages',
      header: 'Wages',
      align: 'right',
      sortValue: (j) => j.wagesPence ?? -1,
      cell: (j) => money(j.wagesPence),
    },
    {
      key: 'fuel',
      header: 'Fuel',
      align: 'right',
      sortValue: (j) => j.fuelPence,
      cell: (j) => money(j.fuelPence),
    },
    {
      key: 'running',
      header: 'Vehicle costs',
      align: 'right',
      sortValue: (j) => j.runningPence,
      cell: (j) => money(j.runningPence),
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      sortValue: (j) => j.costPence,
      cell: (j) => money(j.costPence),
    },
    {
      key: 'profit',
      header: 'Profit',
      align: 'right',
      sortValue: (j) => j.profitPence ?? Number.NEGATIVE_INFINITY,
      cell: (j) => <span style={profitStyle(j.profitPence)}>{money(j.profitPence)}</span>,
    },
    {
      key: 'notes',
      header: '',
      cell: (j) =>
        j.notes.length === 0 ? null : (
          <span className="muted" style={{ fontSize: 12 }}>
            {j.notes.map((n) => NOTE_TEXT[n]).join(', ')}
          </span>
        ),
    },
  ];
  const vehicleColumns: Column<VehicleCostDto>[] = [
    { key: 'name', header: 'Vehicle', sortValue: (v) => v.name, cell: (v) => v.name },
    { key: 'jobs', header: 'Jobs', align: 'right', sortValue: (v) => v.jobs, cell: (v) => v.jobs },
    {
      key: 'hours',
      header: 'Hours',
      align: 'right',
      sortValue: (v) => v.hours,
      cell: (v) => v.hours.toFixed(1),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortValue: (v) => v.revenuePence,
      cell: (v) => money(v.revenuePence),
    },
    {
      key: 'wages',
      header: 'Wages',
      align: 'right',
      sortValue: (v) => v.wagesPence,
      cell: (v) => money(v.wagesPence),
    },
    {
      key: 'fuel',
      header: 'Fuel',
      align: 'right',
      sortValue: (v) => v.fuelPence,
      cell: (v) => money(v.fuelPence),
    },
    {
      key: 'running',
      header: 'Running costs',
      align: 'right',
      sortValue: (v) => v.runningPence,
      cell: (v) => money(v.runningPence),
    },
    {
      key: 'profit',
      header: 'Profit',
      align: 'right',
      sortValue: (v) => v.profitPence,
      cell: (v) => <span style={profitStyle(v.profitPence)}>{money(v.profitPence)}</span>,
    },
  ];
  const customerColumns: Column<CustomerCostDto>[] = [
    { key: 'name', header: 'Customer', sortValue: (c) => c.name, cell: (c) => c.name },
    { key: 'jobs', header: 'Jobs', align: 'right', sortValue: (c) => c.jobs, cell: (c) => c.jobs },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortValue: (c) => c.revenuePence,
      cell: (c) => money(c.revenuePence),
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      sortValue: (c) => c.costPence,
      cell: (c) => money(c.costPence),
    },
    {
      key: 'profit',
      header: 'Profit',
      align: 'right',
      sortValue: (c) => c.profitPence,
      cell: (c) => <span style={profitStyle(c.profitPence)}>{money(c.profitPence)}</span>,
    },
  ];

  const warnings: string[] = [];
  if (t.jobsWithoutPrice > 0) {
    warnings.push(
      `${t.jobsWithoutPrice} job${t.jobsWithoutPrice === 1 ? ' has' : 's have'} no price, so ${t.jobsWithoutPrice === 1 ? 'it has' : 'they have'} no profit. Add prices on the Jobs page.`,
    );
  }
  if (t.jobsWithoutRate > 0) {
    warnings.push(
      `${t.jobsWithoutRate} job${t.jobsWithoutRate === 1 ? '' : 's'} had a driver with no hourly rate, so no wages are counted. Set rates on Running costs and pay.`,
    );
  }
  if (t.unmatchedFuelPence > 0) {
    warnings.push(
      `${formatPence(t.unmatchedFuelPence)} of fuel matched no vehicle, so it is on no job. Match it on the Fuel page.`,
    );
  }

  return (
    <>
      <div className="report-stats">
        <Stat
          label="Revenue"
          value={formatPence(t.revenuePence)}
          note={`${t.jobs} job${t.jobs === 1 ? '' : 's'} delivered`}
        />
        <Stat label="Wages" value={formatPence(t.wagesPence)} />
        <Stat label="Fuel" value={formatPence(t.fuelPence)} />
        <Stat label="Vehicle running costs" value={formatPence(t.runningPence)} />
        <Stat label="Overheads" value={formatPence(t.overheadsPence)} note="not put on any job" />
        <div className="report-stat">
          <div className="report-stat-value" style={profitStyle(t.profitPence)}>
            {formatPence(t.profitPence)}
          </div>
          <div className="report-stat-label">Profit for the month</div>
          <div className="report-stat-note muted">after every cost, overheads too</div>
        </div>
      </div>
      {t.notCoveredPence > 0 && (
        <p className="muted">
          {formatPence(t.notCoveredPence)} of fuel and running costs belong to vehicles that did no
          job this month (or to no vehicle), so no job carries them.
        </p>
      )}
      {warnings.length > 0 && (
        <ul style={{ color: 'var(--warning)' }}>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <h2>By job</h2>
      <DataTable
        columns={jobColumns}
        rows={report.jobs}
        rowKey={(j) => j.jobId}
        searchText={(j) =>
          `${j.reference} ${j.customer ?? ''} ${j.vehicleName ?? ''} ${j.driverName ?? ''}`
        }
        emptyText="No jobs were delivered in this month."
      />
      <h2 style={{ marginTop: 24 }}>By vehicle</h2>
      <DataTable
        columns={vehicleColumns}
        rows={report.vehicles}
        rowKey={(v) => v.vehicleId ?? 'none'}
        emptyText="No vehicle did a job or had a cost this month."
      />
      <h2 style={{ marginTop: 24 }}>By customer</h2>
      <DataTable
        columns={customerColumns}
        rows={report.customers}
        rowKey={(c) => c.name}
        emptyText="No jobs were delivered in this month."
      />

      <details style={{ marginTop: 24 }}>
        <summary>How this is worked out</summary>
        <ul className="muted" style={{ fontSize: 14 }}>
          <li>
            A job&apos;s time runs from the driver accepting it to delivery, and it belongs to the
            month it was delivered in.
          </li>
          <li>Wages are that time at the driver&apos;s rate on the day it was delivered.</li>
          <li>
            Fuel bought for a vehicle that month, and its running costs for the month, are shared
            across its jobs by their time. A vehicle&apos;s jobs together carry all of what it cost;
            a vehicle that did no job shows its costs on its own line.
          </li>
          <li>Overheads belong to the firm and are not added to any job.</li>
          <li>
            A job with no price has no profit, and a driver with no rate adds no wages. Nothing is
            estimated.
          </li>
        </ul>
      </details>
    </>
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
