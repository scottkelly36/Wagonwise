import type { DefectDto } from '@wagonwise/contracts/checks';
import type { FleetVehicleDto } from '@wagonwise/contracts/fleet';
import type { FinanceReportDto, InvoiceDto } from '@wagonwise/contracts/billing';
import type { HoursStatusDto } from '@wagonwise/contracts/hours';
import type { JobDto, JobEtaDto, JobNoticeDto } from '@wagonwise/contracts/jobs';
import type { OverviewRowDto, RepairDto } from '@wagonwise/contracts/maintenance';
import { formatDuration, isOnTheRoad } from './live-map';
import { minutesText } from './hours-status';

/** How a tile reads: quiet when there is nothing to do, amber or red when there is. */
export type Tone = 'quiet' | 'warn' | 'bad' | 'good';
/** The product area a tile belongs to; it picks the colour of its dot (same as the menu). */
export type Area = 'ops' | 'compliance' | 'money' | 'admin';

export interface Tile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly sub: string;
  readonly tone: Tone;
  readonly area: Area;
  /** Where clicking it goes. */
  readonly to: string;
}

/** Amber or red only when there is something to act on. */
const toneFor = (count: number, whenNonZero: Tone): Tone => (count === 0 ? 'quiet' : whenNonZero);

/** Today as `YYYY-MM-DD` on the viewer's clock (a UK dispatcher's, in practice). */
export function localDay(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** Inputs for the manager's tiles. Anything the person cannot see (no privilege for it) is left out and so is its tile. */
export interface ManagerTileData {
  readonly jobs: readonly JobDto[];
  readonly notices?: readonly JobNoticeDto[] | undefined;
  readonly defects?: readonly DefectDto[] | undefined;
  readonly overview?: readonly OverviewRowDto[] | undefined;
}

/** The first row of the manager's home: what needs a person now. */
export function managerTiles(data: ManagerTileData, now: Date): Tile[] {
  const tiles: Tile[] = [];
  const today = localDay(now);

  const waiting = data.jobs.filter((j) => j.status === 'draft');
  const dueToday = waiting.filter(
    (j) => j.dueBy !== undefined && localDay(new Date(j.dueBy)) === today,
  );
  tiles.push({
    key: 'unassigned',
    label: 'Unassigned jobs',
    value: String(waiting.length),
    sub: dueToday.length > 0 ? `${dueToday.length} due today` : 'None due today',
    tone: toneFor(waiting.length, 'warn'),
    area: 'ops',
    to: '/fleet/jobs',
  });

  if (data.notices !== undefined) {
    const unopened = data.notices.filter((n) => n.seenAt === null);
    const oldest = unopened
      .flatMap((n) => (n.lastAttemptAt === null ? [] : [new Date(n.lastAttemptAt).getTime()]))
      .sort((a, b) => a - b)[0];
    tiles.push({
      key: 'not-opened',
      label: 'Not opened yet',
      value: String(unopened.length),
      sub:
        oldest === undefined
          ? 'Drivers have opened theirs'
          : `Longest waiting ${formatDuration(Math.max(1, Math.round((now.getTime() - oldest) / 60_000)))}`,
      tone: toneFor(unopened.length, 'warn'),
      area: 'ops',
      to: '/fleet/jobs',
    });
  }

  if (data.defects !== undefined) {
    const stop = data.defects.filter((d) => d.severity === 'do_not_drive' && d.status !== 'fixed');
    const first = stop[0];
    tiles.push({
      key: 'do-not-drive',
      label: 'Do not drive',
      value: String(stop.length),
      sub:
        first === undefined
          ? 'No vehicle held back'
          : `${first.vehicleName}, ${first.label.toLowerCase()}`,
      tone: toneFor(stop.length, 'bad'),
      area: 'compliance',
      to: '/fleet/defects',
    });
  }

  if (data.overview !== undefined) {
    const overdue = data.overview.filter((r) => r.status === 'overdue').length;
    const soon = data.overview.filter((r) => r.status === 'due_soon').length;
    tiles.push({
      key: 'maintenance',
      label: 'Maintenance overdue',
      value: String(overdue),
      sub: soon === 0 ? 'Nothing else due soon' : `${soon} more due soon`,
      tone: toneFor(overdue, 'warn'),
      area: 'compliance',
      to: '/fleet/maintenance',
    });
  }
  return tiles;
}

export interface RoadRow {
  readonly jobId: string;
  readonly reference: string;
  readonly who: string;
  /** "ETA around 14:20", or what is known. */
  readonly eta: string;
  /** The arrival is later than the job's due time. */
  readonly late: boolean;
  /** How late, when known. */
  readonly lateBy: string | undefined;
}

/** The jobs being driven now, with the driver and vehicle, and whether each will be late. */
export function onTheRoad(input: {
  readonly jobs: readonly JobDto[];
  readonly etas: readonly JobEtaDto[];
  readonly driverName: (driverId: string | undefined) => string | undefined;
  readonly vehicleName: (vehicleId: string | undefined) => string | undefined;
  readonly now: Date;
}): RoadRow[] {
  return input.jobs
    .filter((j) => isOnTheRoad(j.status))
    .map((job) => {
      const eta = input.etas.find((e) => e.jobId === job.id);
      const arrival =
        eta === undefined
          ? undefined
          : new Date(eta.fromRecordedAt).getTime() + eta.durationMin * 60_000;
      const due = job.dueBy === undefined ? undefined : new Date(job.dueBy).getTime();
      const lateMs = arrival !== undefined && due !== undefined ? arrival - due : undefined;
      const who = [input.driverName(job.driverId), input.vehicleName(job.vehicleId)]
        .filter((x): x is string => x !== undefined)
        .join(', ');
      return {
        jobId: job.id,
        reference: job.reference,
        who: who === '' ? 'Driver and vehicle unknown' : who,
        eta:
          arrival === undefined
            ? 'No ETA yet'
            : `ETA around ${new Date(arrival).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
        late: lateMs !== undefined && lateMs > 0,
        lateBy:
          lateMs !== undefined && lateMs > 0
            ? formatDuration(Math.max(1, Math.round(lateMs / 60_000)))
            : undefined,
      };
    });
}

/** Sharing drivers with under half an hour of driving left, for the live panel. */
export function lowOnHours(
  statuses: readonly HoursStatusDto[],
  name: (driverId: string) => string | undefined,
): string[] {
  return statuses
    .filter((s) => s.state !== 'on_break' && s.drivingLeftMin < 30)
    .map(
      (s) => `${name(s.driverId) ?? 'A driver'}: ${minutesText(s.drivingLeftMin)} of driving left`,
    );
}

export interface Row {
  readonly label: string;
  readonly value: string;
  readonly tone: Tone;
}

/** Inputs for the compliance panel. Left out when the person cannot see it. */
export interface ComplianceData {
  readonly vehicles?: readonly FleetVehicleDto[] | undefined;
  /** Checks done today. */
  readonly checksToday?: readonly { readonly vehicleId: string }[] | undefined;
  readonly defects?: readonly DefectDto[] | undefined;
  readonly repairs?: readonly RepairDto[] | undefined;
  readonly capacity?:
    { readonly vehiclesInUse: number; readonly capacityToday: number } | undefined;
  readonly joinRequests?: number | undefined;
}

/** The rows of the compliance panel, and how far through today's checks the fleet is (0 to 1), if known. */
export function complianceRows(data: ComplianceData): {
  rows: Row[];
  checksShare: number | undefined;
} {
  const rows: Row[] = [];
  let checksShare: number | undefined;
  if (data.vehicles !== undefined && data.checksToday !== undefined) {
    const done = new Set(data.checksToday.map((c) => c.vehicleId));
    const doneCount = data.vehicles.filter((v) => done.has(v.id)).length;
    checksShare = data.vehicles.length === 0 ? undefined : doneCount / data.vehicles.length;
    rows.push({
      label: 'Walk-round checks done today',
      value: `${doneCount} of ${data.vehicles.length}`,
      tone: data.vehicles.length > doneCount ? 'warn' : 'good',
    });
  }
  if (data.defects !== undefined) {
    const open = data.defects.filter((d) => d.status !== 'fixed').length;
    rows.push({ label: 'Open defects', value: String(open), tone: toneFor(open, 'warn') });
  }
  if (data.repairs !== undefined) {
    const late = data.repairs.filter((r) => r.overdue).length;
    rows.push({ label: 'Repairs overdue', value: String(late), tone: toneFor(late, 'bad') });
  }
  if (data.capacity !== undefined) {
    const over = data.capacity.vehiclesInUse > data.capacity.capacityToday;
    rows.push({
      label: 'Vehicles on your plan',
      value: `${data.capacity.vehiclesInUse} of ${data.capacity.capacityToday}`,
      tone: over ? 'bad' : 'quiet',
    });
  }
  if (data.joinRequests !== undefined) {
    rows.push({
      label: 'Driver requests',
      value: data.joinRequests === 0 ? 'None waiting' : `${data.joinRequests} to approve`,
      tone: toneFor(data.joinRequests, 'warn'),
    });
  }
  return { rows, checksShare };
}

// --- WagonWise admin ---------------------------------------------------------------------------------------------------

const pounds = (pence: number): string =>
  `${pence < 0 ? '-' : ''}£${Math.abs(Math.round(pence / 100)).toLocaleString('en-GB')}`;

/** The platform admin's tiles: this month's money from the Finances report, and what is waiting. */
export function platformTiles(input: {
  readonly finance: FinanceReportDto;
  readonly invoices: readonly InvoiceDto[];
}): Tile[] {
  const current = input.finance.months.find((m) => m.month === input.finance.currentMonth);
  const drafts = input.invoices.filter((i) => i.status === 'draft').length;
  const invoiced = current?.invoicedPence ?? 0;
  const costs = current?.costsPence ?? 0;
  const profit = current?.profitInvoicedPence ?? 0;
  return [
    {
      key: 'revenue',
      label: 'Invoiced this month',
      value: pounds(invoiced),
      sub: `${input.finance.projection.vehiclesCovered} ${plural(input.finance.projection.vehiclesCovered, 'vehicle')}, ${input.finance.revenueByCompany.length} ${plural(input.finance.revenueByCompany.length, 'company', 'companies')}`,
      tone: 'quiet',
      area: 'money',
      to: '/admin/finances',
    },
    {
      key: 'costs',
      label: 'Costs this month',
      value: pounds(costs),
      sub: 'Your standing entries',
      tone: 'quiet',
      area: 'money',
      to: '/admin/finances',
    },
    {
      key: 'profit',
      label: 'Profit on invoiced',
      value: pounds(profit),
      sub: profit < 0 ? 'Costs are above income' : 'Income less costs',
      tone: profit < 0 ? 'bad' : 'good',
      area: 'money',
      to: '/admin/finances',
    },
    {
      key: 'drafts',
      label: 'Invoices to issue',
      value: String(drafts),
      sub: drafts === 0 ? 'No drafts waiting' : 'Drafts waiting to be issued',
      tone: toneFor(drafts, 'warn'),
      area: 'money',
      to: '/admin/invoices',
    },
  ];
}

/** The last `n` months for the small chart, oldest first, with bar heights as shares (0 to 1) of the largest figure. */
export function chartMonths(
  finance: FinanceReportDto,
  n = 6,
): { month: string; revenue: number; costs: number; revenuePence: number; costsPence: number }[] {
  const last = finance.months.slice(-n);
  const top = Math.max(1, ...last.flatMap((m) => [m.invoicedPence, m.costsPence]));
  return last.map((m) => ({
    month: m.month,
    revenue: m.invoicedPence / top,
    costs: m.costsPence / top,
    revenuePence: m.invoicedPence,
    costsPence: m.costsPence,
  }));
}

/** The platform's "needs action" rows. */
export function platformRows(input: {
  readonly moderationQueue: number;
  readonly invoices: readonly InvoiceDto[];
}): Row[] {
  const issued = input.invoices.filter((i) => i.status === 'issued').length;
  return [
    {
      label: 'Hazard reports to review',
      value: String(input.moderationQueue),
      tone: toneFor(input.moderationQueue, 'warn'),
    },
    { label: 'Invoices issued, not paid', value: String(issued), tone: toneFor(issued, 'warn') },
  ];
}

export { pounds };
