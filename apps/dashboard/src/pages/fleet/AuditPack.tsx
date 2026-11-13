import { useQuery } from '@tanstack/react-query';
import type { AuditPackDto } from '@wagonwise/contracts/audit';
import { useMemo, useState } from 'react';
import * as auditApi from '../../api/audit';
import * as fleetApi from '../../api/fleet';
import { Badge, type BadgeTone } from '../../components/Badge';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Loading } from '../../components/Loading';
import {
  auditCsv,
  auditCsvFileName,
  auditPackHtml,
  dateTimeText,
  dayText,
  DEFECT_STATUS_LABELS,
  EVENT_LABELS,
  ITEM_STATE_LABELS,
  PRESET_LABELS,
  presetRange,
  rangeProblem,
  REPORT_NOTES,
  RESULT_LABELS,
  SEVERITY_LABELS,
  statusSteps,
  summaryLines,
  type DayRange,
  type RangePreset,
} from '../../lib/audit-pack';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { useWorkingCompany } from '../../state/working-company-store';

const PRESETS: readonly RangePreset[] = ['last3', 'last12', 'last24', 'custom'];

const RESULT_TONES: Record<AuditPackDto['checks'][number]['result'], BadgeTone> = {
  clear: 'ok',
  advisory: 'warning',
  do_not_drive: 'danger',
};
const STATE_TONES: Record<AuditPackDto['maintenance']['items'][number]['state'], BadgeTone> = {
  overdue: 'danger',
  due_soon: 'warning',
  ok: 'ok',
};

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

type Check = AuditPackDto['checks'][number];
type Defect = AuditPackDto['defects'][number];
type Item = AuditPackDto['maintenance']['items'][number];
type Done = AuditPackDto['maintenance']['done'][number];
type Event = AuditPackDto['timeline'][number];
type Change = AuditPackDto['maintenance']['changes'][number];

const checkColumns: Column<Check>[] = [
  {
    key: 'when',
    header: 'When',
    sortValue: (c) => c.submittedAt,
    cell: (c) => dateTimeText(c.submittedAt),
  },
  { key: 'list', header: 'List', cell: (c) => `${c.list} (version ${c.listVersion})` },
  { key: 'who', header: 'Done by', sortValue: (c) => c.who, cell: (c) => c.who },
  {
    key: 'result',
    header: 'Result',
    sortValue: (c) => c.result,
    cell: (c) => <Badge tone={RESULT_TONES[c.result]}>{RESULT_LABELS[c.result]}</Badge>,
  },
  {
    key: 'defects',
    header: 'Defects',
    align: 'right',
    sortValue: (c) => c.defects,
    cell: (c) => c.defects,
  },
];

const defectColumns: Column<Defect>[] = [
  {
    key: 'found',
    header: 'Found',
    sortValue: (d) => d.foundAt,
    cell: (d) => (
      <>
        {dateTimeText(d.foundAt)}
        <span className="text-muted text-13 block">{d.foundBy}</span>
      </>
    ),
  },
  {
    key: 'what',
    header: 'What',
    sortValue: (d) => d.item,
    cell: (d) => (
      <>
        {d.item}
        <span className="text-muted text-13 block">
          {[d.detail, d.note].filter((t) => t !== undefined && t !== '').join(' · ')}
        </span>
      </>
    ),
  },
  { key: 'severity', header: 'How serious', cell: (d) => SEVERITY_LABELS[d.severity] },
  {
    key: 'status',
    header: 'Status',
    sortValue: (d) => d.status,
    cell: (d) => (
      <>
        {DEFECT_STATUS_LABELS[d.status]}
        {statusSteps(d).map((step) => (
          <span key={`${step.status}-${step.at}`} className="text-muted text-13 block">
            {DEFECT_STATUS_LABELS[step.status]}: {dateTimeText(step.at)}
            {step.by === undefined ? '' : `, ${step.by}`}
          </span>
        ))}
      </>
    ),
  },
  {
    key: 'repair',
    header: 'Repair',
    cell: (d) =>
      d.repair === undefined ? (
        <span className="text-muted">None booked</span>
      ) : (
        <>
          {d.repair.title}
          <span className="text-muted text-13 block">
            Due {dayText(d.repair.dueDate)}, {d.repair.status}
            {d.repair.doneOn === undefined ? '' : ` on ${dayText(d.repair.doneOn)}`}
            {d.repair.finishedBy === undefined ? '' : ` by ${d.repair.finishedBy}`}
          </span>
        </>
      ),
  },
];

const itemColumns: Column<Item>[] = [
  { key: 'name', header: 'Item', sortValue: (i) => i.name, cell: (i) => i.name },
  { key: 'due', header: 'Next due', sortValue: (i) => i.dueDate, cell: (i) => dayText(i.dueDate) },
  {
    key: 'last',
    header: 'Last done',
    sortValue: (i) => i.lastDone ?? '',
    cell: (i) => (i.lastDone === undefined ? '' : dayText(i.lastDone)),
  },
  {
    key: 'state',
    header: 'Where it stands',
    cell: (i) => <Badge tone={STATE_TONES[i.state]}>{ITEM_STATE_LABELS[i.state]}</Badge>,
  },
];

const changeColumns: Column<Change>[] = [
  { key: 'when', header: 'When', sortValue: (c) => c.at, cell: (c) => dateTimeText(c.at) },
  { key: 'item', header: 'Item', sortValue: (c) => c.item, cell: (c) => c.item },
  {
    key: 'from',
    header: 'Date before',
    cell: (c) =>
      c.from === undefined ? <span className="text-muted">No date before</span> : dayText(c.from),
  },
  { key: 'to', header: 'New date', cell: (c) => dayText(c.to) },
  { key: 'by', header: 'By', cell: (c) => c.by ?? '' },
];

const doneColumns: Column<Done>[] = [
  { key: 'item', header: 'Item', sortValue: (d) => d.item, cell: (d) => d.item },
  { key: 'on', header: 'Done on', sortValue: (d) => d.doneOn, cell: (d) => dayText(d.doneOn) },
  { key: 'next', header: 'Next due', cell: (d) => dayText(d.nextDue) },
  { key: 'by', header: 'Recorded by', cell: (d) => d.by ?? '' },
  { key: 'note', header: 'Note', cell: (d) => d.note ?? '' },
];

const eventColumns: Column<Event>[] = [
  {
    key: 'when',
    header: 'When',
    sortValue: (e) => e.at,
    cell: (e) => (e.kind === 'maintenance_done' ? dayText(e.at.slice(0, 10)) : dateTimeText(e.at)),
  },
  { key: 'kind', header: 'Record', cell: (e) => EVENT_LABELS[e.kind] },
  {
    key: 'what',
    header: 'What',
    cell: (e) => (
      <>
        {e.title}
        {e.detail === undefined ? null : (
          <span className="text-muted text-13 block">{e.detail}</span>
        )}
      </>
    ),
  },
  { key: 'who', header: 'Who', cell: (e) => e.who ?? '' },
];

/**
 * A vehicle's walk-round checks, defects, repairs and maintenance for a period in one report, to read here, print or save as
 * a PDF, or take away as a spreadsheet. Read-only. It shows the records as they were entered, and says so.
 */
export function AuditPack() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const allowed =
    everyCompany || holds(me, 'manage_fleet') || holds(me, 'dispatch') || holds(me, 'view_reports');

  const [selectedCompanyId, setSelectedCompanyId] = useWorkingCompany();
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const [vehicleId, setVehicleId] = useState('');
  const [preset, setPreset] = useState<RangePreset>('last12');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [printError, setPrintError] = useState<string | undefined>(undefined);

  const vehicles = useQuery({
    queryKey: ['fleet-vehicles', companyId],
    queryFn: () =>
      withAccessToken((token) => fleetApi.listFleetVehicles(token, companyId as string)),
    enabled: allowed && companyId !== undefined,
  });

  const problem = preset === 'custom' ? rangeProblem(customFrom, customTo) : undefined;
  const range: DayRange | undefined = useMemo(
    () =>
      preset === 'custom'
        ? problem === undefined
          ? { from: customFrom, to: customTo }
          : undefined
        : presetRange(preset, new Date()),
    [preset, customFrom, customTo, problem],
  );

  const pack = useQuery({
    queryKey: ['audit-pack', vehicleId, range?.from, range?.to],
    queryFn: () =>
      withAccessToken((token) => auditApi.getAuditPack(token, vehicleId, range as DayRange)),
    enabled: allowed && vehicleId !== '' && range !== undefined,
  });

  if (!allowed) {
    return (
      <div>
        <h1>Audit pack</h1>
        <p className="text-muted">
          The audit pack needs permission to see check results or reports. Ask a user manager at
          your company to add it to your account.
        </p>
      </div>
    );
  }

  /** Opens the pack in a new tab and offers it for printing or saving as a PDF. */
  function print(data: AuditPackDto): void {
    setPrintError(undefined);
    const tab = window.open('', '_blank');
    if (tab === null) {
      setPrintError('Allow pop-ups for this site to open the audit pack.');
      return;
    }
    tab.document.open();
    tab.document.write(auditPackHtml(data));
    tab.document.close();
    tab.focus();
    setTimeout(() => tab.print(), 400);
  }

  const data = pack.data;
  const vehicleList = vehicles.data ?? [];

  return (
    <div>
      <h1>Audit pack</h1>
      <p className="text-muted">
        One vehicle&apos;s walk-round checks, defects, repairs and maintenance for a period, in one
        report you can print, save as a PDF or take away as a spreadsheet. It shows the records as
        they were entered.
      </p>

      <div className="report-filters">
        {everyCompany && (
          <label>
            Company{' '}
            <CompanySelect
              id="audit-company"
              value={selectedCompanyId}
              onChange={(id) => {
                setSelectedCompanyId(id);
                setVehicleId('');
              }}
              emptyLabel="— choose a company —"
            />
          </label>
        )}
        <label>
          Vehicle{' '}
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            disabled={companyId === undefined || vehicles.isPending}
          >
            <option value="">
              {companyId === undefined
                ? 'Choose a company first'
                : vehicles.isPending
                  ? 'Loading vehicles…'
                  : '— choose a vehicle —'}
            </option>
            {vehicleList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.registration === undefined ? '' : ` (${v.registration})`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Period{' '}
          <select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}>
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
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              To{' '}
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>
        )}
      </div>
      {problem !== undefined && customFrom !== '' && customTo !== '' && (
        <p className="text-danger">{problem}</p>
      )}
      {vehicles.isError && <ErrorNotice error={vehicles.error} />}
      {vehicleId === '' &&
        companyId !== undefined &&
        !vehicles.isPending &&
        vehicleList.length === 0 && <p className="text-muted">This company has no vehicles yet.</p>}

      {pack.isError && <ErrorNotice error={pack.error} />}
      {pack.isFetching && <Loading />}
      {data !== undefined && !pack.isFetching && (
        <>
          <h2>
            {data.vehicle.name}
            {data.vehicle.registration === undefined ? '' : `, ${data.vehicle.registration}`}
          </h2>
          <p className="text-muted">
            {dayText(data.range.from)} to {dayText(data.range.to)}
            {data.vehicle.company === undefined ? '' : ` · ${data.vehicle.company}`}
          </p>
          <ul className="mt-0">
            {summaryLines(data).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="flex gap-8 wrap mb-16">
            <button type="button" className="btn-primary" onClick={() => print(data)}>
              Print or save as PDF
            </button>
            <button type="button" onClick={() => download(auditCsvFileName(data), auditCsv(data))}>
              Download as a spreadsheet
            </button>
          </div>
          {printError !== undefined && <p className="text-danger">{printError}</p>}

          <h3>Walk-round checks</h3>
          <DataTable
            columns={checkColumns}
            rows={data.checks}
            rowKey={(c) => c.id}
            pageSize={500}
            maxHeight={360}
            emptyText="No checks were recorded in this period."
          />
          <h3>Defects and repairs</h3>
          <DataTable
            columns={defectColumns}
            rows={data.defects}
            rowKey={(d) => d.id}
            pageSize={500}
            maxHeight={360}
            emptyText="No defects in this period, and none still open."
          />
          <h3>Maintenance dates today</h3>
          <DataTable
            columns={itemColumns}
            rows={data.maintenance.items}
            rowKey={(i) => i.name}
            pageSize={500}
            maxHeight={360}
            emptyText="No maintenance dates are kept for this vehicle."
          />
          <h3>Maintenance done in this period</h3>
          <DataTable
            columns={doneColumns}
            rows={data.maintenance.done}
            rowKey={(d) => `${d.item}-${d.doneOn}-${d.recordedAt}`}
            pageSize={500}
            maxHeight={360}
            emptyText="Nothing was recorded as done in this period."
          />
          <h3>Due dates entered or corrected</h3>
          <DataTable
            columns={changeColumns}
            rows={data.maintenance.changes}
            rowKey={(c) => `${c.item}-${c.at}`}
            pageSize={500}
            maxHeight={360}
            emptyText="No due date was entered or corrected by hand in this period."
          />
          <h3>Everything in order</h3>
          <DataTable
            columns={eventColumns}
            rows={data.timeline}
            rowKey={(e) => `${e.at}-${e.kind}-${e.title}`}
            pageSize={500}
            maxHeight={480}
            emptyText="Nothing was recorded in this period."
          />
          <div className="box mt-24">
            {REPORT_NOTES.map((note) => (
              <p key={note} className="text-13 mt-0">
                {note}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
