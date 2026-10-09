import type { JobReportRowDto } from '@wagonwise/contracts/jobs';
import { formatPence } from './money';

/** The periods the reports page offers, besides a custom range. */
export type ReportPreset = 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

export const PRESET_LABELS: Record<ReportPreset, string> = {
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  custom: 'Custom dates',
};

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export interface ReportRange {
  /** Inclusive start, and exclusive end: the report's own convention (core). */
  readonly from: Date;
  readonly to: Date;
}

/**
 * The range a preset means, in the viewer's own time zone: "last 7 days" is today and the six days
 * before it, whole days, so a report run in the afternoon still includes this morning's jobs.
 */
export function presetRange(preset: Exclude<ReportPreset, 'custom'>, now: Date): ReportRange {
  const today = startOfDay(now);
  switch (preset) {
    case 'last7':
      return { from: addDays(today, -6), to: addDays(today, 1) };
    case 'last30':
      return { from: addDays(today, -29), to: addDays(today, 1) };
    case 'thisMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case 'lastMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 1),
      };
  }
}

/** A custom range from two `yyyy-mm-dd` dates (both days included), or undefined if either is missing
 *  or the end is before the start. */
export function customRange(fromDate: string, toDate: string): ReportRange | undefined {
  const parse = (text: string): Date | undefined => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match === null) return undefined;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? undefined : date;
  };
  const from = parse(fromDate);
  const last = parse(toDate);
  if (from === undefined || last === undefined || last.getTime() < from.getTime()) return undefined;
  return { from, to: addDays(last, 1) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-10-05 14:30` in the viewer's time zone: reads the same in a spreadsheet as in the page. */
export function dateTimeText(iso: string | undefined): string {
  if (iso === undefined) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * One CSV cell. Quoted when it holds a comma, quote or line break. A cell that starts with `=`, `+`,
 * `-` or `@` gets a leading apostrophe: spreadsheets treat those as formulas, and references and stop
 * names are typed by people (a CSV that runs someone's formula when opened is a known attack).
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const COLUMNS: readonly {
  readonly header: string;
  readonly value: (r: JobReportRowDto) => string;
}[] = [
  { header: 'Reference', value: (r) => r.reference },
  { header: 'Status', value: (r) => statusText(r.status) },
  { header: 'Pickup', value: (r) => r.pickup ?? '' },
  { header: 'Delivery', value: (r) => r.delivery ?? '' },
  { header: 'Driver', value: (r) => r.driver ?? '' },
  { header: 'Vehicle', value: (r) => r.vehicle ?? '' },
  { header: 'Customer', value: (r) => r.customer ?? '' },
  {
    header: 'Price (£)',
    value: (r) => (r.pricePence === undefined ? '' : (r.pricePence / 100).toFixed(2)),
  },
  { header: 'Created', value: (r) => dateTimeText(r.createdAt) },
  { header: 'Due by', value: (r) => dateTimeText(r.dueBy) },
  { header: 'Accepted', value: (r) => dateTimeText(r.acceptedAt) },
  { header: 'Set off', value: (r) => dateTimeText(r.setOffAt) },
  { header: 'Delivered', value: (r) => dateTimeText(r.deliveredAt) },
  { header: 'Ended (cancelled or failed)', value: (r) => dateTimeText(r.endedAt) },
  {
    header: 'Minutes accepted to delivered',
    value: (r) =>
      r.minutesAcceptedToDelivered === undefined
        ? ''
        : String(Math.round(r.minutesAcceptedToDelivered)),
  },
  { header: 'On time', value: (r) => (r.onTime === undefined ? '' : r.onTime ? 'Yes' : 'No') },
  {
    header: 'Proof of delivery required',
    value: (r) => (r.requiresProofOfDelivery ? 'Yes' : 'No'),
  },
  { header: 'Proof of delivery received', value: (r) => (r.hasProofOfDelivery ? 'Yes' : 'No') },
];

/** A job's status as a person reads it: "at pickup", not "at_pickup". */
export function statusText(status: string): string {
  const text = status.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The whole CSV, with a byte-order mark so Excel opens it as UTF-8 (names with accents survive). */
export function toCsv(rows: readonly JobReportRowDto[]): string {
  const lines = [
    COLUMNS.map((c) => csvCell(c.header)).join(','),
    ...rows.map((row) => COLUMNS.map((c) => csvCell(c.value(row))).join(',')),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** `wagonwise-jobs-2026-10-01-to-2026-10-31.csv`; the end is the last day included. */
export function csvFileName(range: ReportRange): string {
  const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `wagonwise-jobs-${day(range.from)}-to-${day(addDays(range.to, -1))}.csv`;
}

export interface RevenueLine {
  readonly name: string;
  readonly jobs: number;
  readonly revenuePence: number;
}

/**
 * Revenue split by customer or by vehicle: the price of each job delivered in the period, grouped, largest first. A delivered
 * job with no price is counted in `jobs` but adds nothing, so a gap shows up as a line with jobs and no money. Jobs with no
 * customer (or vehicle) are grouped as "No customer" ("No vehicle").
 */
export function revenueBy(
  rows: readonly JobReportRowDto[],
  range: ReportRange,
  by: 'customer' | 'vehicle',
): RevenueLine[] {
  const lines = new Map<string, { jobs: number; revenuePence: number }>();
  for (const row of rows) {
    if (row.status !== 'delivered' || row.deliveredAt === undefined) continue;
    const at = new Date(row.deliveredAt).getTime();
    if (at < range.from.getTime() || at >= range.to.getTime()) continue;
    const name =
      (by === 'customer' ? row.customer : row.vehicle) ??
      (by === 'customer' ? 'No customer' : 'No vehicle');
    const line = lines.get(name) ?? { jobs: 0, revenuePence: 0 };
    lines.set(name, {
      jobs: line.jobs + 1,
      revenuePence: line.revenuePence + (row.pricePence ?? 0),
    });
  }
  return [...lines]
    .map(([name, l]) => ({ name, ...l }))
    .sort((a, b) => b.revenuePence - a.revenuePence || a.name.localeCompare(b.name));
}

/** "£1,234.00", or a dash when there is nothing to show. */
export const moneyText = (pence: number | undefined): string =>
  pence === undefined ? '–' : formatPence(pence);
