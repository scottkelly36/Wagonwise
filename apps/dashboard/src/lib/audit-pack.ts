import type { AuditEventDto, AuditPackDto } from '@wagonwise/contracts/audit';

import { escapeHtml } from './delivery-record';
import { csvCell } from './job-report';

export type RangePreset = 'last3' | 'last12' | 'last24' | 'custom';

export const PRESET_LABELS: Record<RangePreset, string> = {
  last3: 'Last 3 months',
  last12: 'Last 12 months',
  last24: 'Last 24 months',
  custom: 'Choose dates',
};

const PRESET_DAYS = { last3: 91, last12: 365, last24: 730 } as const;

/** The longest range the server will make a pack for. */
export const MAX_RANGE_DAYS = 800;

export interface DayRange {
  readonly from: string;
  readonly to: string;
}

/** Today's date in the UK, `YYYY-MM-DD`. */
export const ukToday = (now: Date): string =>
  now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** The last so many days up to and including today. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, now: Date): DayRange {
  const to = ukToday(now);
  return { from: addDays(to, -(PRESET_DAYS[preset] - 1)), to };
}

/** Why two chosen dates cannot be used, in a sentence, or `undefined` when they can. */
export function rangeProblem(from: string, to: string): string | undefined {
  if (from === '' || to === '') return 'Choose both dates.';
  if (from > to) return 'The first date has to be on or before the second.';
  if (addDays(from, MAX_RANGE_DAYS) < to) return 'Choose a period of about two years or less.';
  return undefined;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-11-03` as "3 Nov 2026". The months are written out here, not taken from the browser's locale data (some write September
 * as "Sept"), so the page, the printed copy and the server's timeline wording always match.
 */
export function dayText(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

const UK_PARTS = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/London',
});

/** A moment as "3 Nov 2026, 06:30" in UK time. */
export function dateTimeText(iso: string): string {
  const parts = Object.fromEntries(
    UK_PARTS.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const day = `${parts.year}-${(parts.month ?? '1').padStart(2, '0')}-${(parts.day ?? '1').padStart(2, '0')}`;
  return `${dayText(day)}, ${parts.hour}:${parts.minute}`;
}

export const RESULT_LABELS = {
  clear: 'All clear',
  advisory: 'Fix soon',
  do_not_drive: 'Do not drive',
} as const;

export const SEVERITY_LABELS = { advisory: 'Fix soon', do_not_drive: 'Do not drive' } as const;

export const DEFECT_STATUS_LABELS = {
  open: 'Open',
  acknowledged: 'Seen by the office',
  fixed: 'Fixed',
} as const;

export const REPAIR_STATUS_LABELS = { open: 'Open', done: 'Done', cancelled: 'Cancelled' } as const;

export const ITEM_STATE_LABELS = { overdue: 'Overdue', due_soon: 'Due soon', ok: 'Fine' } as const;

export const EVENT_LABELS: Record<AuditEventDto['kind'], string> = {
  check: 'Check',
  defect_found: 'Defect found',
  defect_changed: 'Defect changed',
  repair_booked: 'Repair booked',
  repair_finished: 'Repair finished',
  maintenance_done: 'Maintenance done',
  due_date_changed: 'Due date changed',
};

type Defect = AuditPackDto['defects'][number];

/**
 * Every step of a defect's status, oldest first. A defect with no steps on record (changed before the history was kept) shows the
 * one change it does have, so a handled defect is never shown with no trace of who handled it.
 */
export function statusSteps(d: Defect): { status: Defect['status']; at: string; by?: string }[] {
  if (d.history.length > 0) {
    return d.history.map((h) => ({
      status: h.status,
      at: h.at,
      ...(h.by === undefined ? {} : { by: h.by }),
    }));
  }
  return d.lastChangeAt === undefined
    ? []
    : [
        {
          status: d.status,
          at: d.lastChangeAt,
          ...(d.lastChangeBy === undefined ? {} : { by: d.lastChangeBy }),
        },
      ];
}

/** A maintenance entry carries only a day (placed at midday), so showing a time for it would be false precision. */
const eventWhen = (e: AuditEventDto): string =>
  e.kind === 'maintenance_done' ? dayText(e.at.slice(0, 10)) : dateTimeText(e.at);

/** The whole timeline as a spreadsheet: one line per thing that happened, oldest first. */
export function auditCsv(pack: AuditPackDto): string {
  const header = ['When', 'Record', 'What', 'Detail', 'Who'];
  const lines = [
    header.map(csvCell).join(','),
    ...pack.timeline.map((e) =>
      [eventWhen(e), EVENT_LABELS[e.kind], e.title, e.detail ?? '', e.who ?? '']
        .map(csvCell)
        .join(','),
    ),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** `wagonwise-audit-nx21abc-2025-11-09-to-2026-11-08.csv` (the registration, or the vehicle's name without one). */
export function auditCsvFileName(pack: AuditPackDto): string {
  const slug = (pack.vehicle.registration ?? pack.vehicle.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `wagonwise-audit-${slug === '' ? 'vehicle' : slug}-${pack.range.from}-to-${pack.range.to}.csv`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The summary as plain sentences, for the page and the printed copy. */
export function summaryLines(pack: AuditPackDto): string[] {
  const s = pack.summary;
  return [
    `Walk-round checks: ${s.checks} (${s.clear} all clear, ${s.advisory} fix soon, ${s.doNotDrive} do not drive).`,
    `Defects found in this period: ${s.defectsFound}. ${plural(s.defectsNotFixed, 'defect is', 'defects are')} not marked fixed (older ones included).`,
    `Maintenance recorded as done: ${s.maintenanceDone}. ${plural(s.maintenanceOverdue, 'item is', 'items are')} overdue today.`,
    `Due dates entered or corrected by hand in this period: ${s.dueDatesChanged}.`,
  ];
}

/** What the report is, and what it is not. The same words are printed on every copy. */
export const REPORT_NOTES = [
  'Prepared from the records held in WagonWise. Drivers answer the walk-round checks on their phones, and the company’s staff enter repairs and maintenance dates. This report shows them as entered. It is not a statement that the vehicle or the operator meets any legal requirement.',
  'Each change of a defect’s status, and each due date entered or corrected by hand, is recorded with who made it and when. A change made before this history was kept may show only the latest one, or none. Recording maintenance as done is shown under “done”, with the next date it set.',
  'A person who has since left the company appears as “Someone no longer on the account”.',
] as const;

const cell = (text: string | undefined): string => escapeHtml(text ?? '');

/**
 * The pack as a printable page (the browser's Save as PDF), built in the same way as the invoice and the delivery record.
 * Everything typed by a person is escaped.
 */
export function auditPackHtml(pack: AuditPackDto): string {
  const vehicle = pack.vehicle;
  const title = `Vehicle audit pack, ${vehicle.registration ?? vehicle.name}`;

  const checks = pack.checks
    .map(
      (c) => `<tr>
        <td>${escapeHtml(dateTimeText(c.submittedAt))}</td>
        <td>${cell(c.list)} (version ${c.listVersion})</td>
        <td>${cell(c.who)}</td>
        <td>${RESULT_LABELS[c.result]}</td>
        <td class="num">${c.defects}</td>
      </tr>`,
    )
    .join('');

  const defects = pack.defects
    .map((d) => {
      const repair = d.repair;
      const repairText =
        repair === undefined
          ? 'No repair booked'
          : `${repair.title}, due ${dayText(repair.dueDate)}: ${REPAIR_STATUS_LABELS[repair.status].toLowerCase()}${
              repair.doneOn === undefined ? '' : ` on ${dayText(repair.doneOn)}`
            }${repair.finishedBy === undefined ? '' : ` by ${repair.finishedBy}`}${
              repair.note === undefined ? '' : `. ${repair.note}`
            }`;
      return `<tr>
        <td>${escapeHtml(dateTimeText(d.foundAt))}<br><span class="muted">${cell(d.foundBy)}</span></td>
        <td>${cell(d.item)}<br><span class="muted">${cell([d.detail, d.note].filter((t) => t !== undefined && t !== '').join(' · '))}</span></td>
        <td>${SEVERITY_LABELS[d.severity]}</td>
        <td>${DEFECT_STATUS_LABELS[d.status]}${statusSteps(d)
          .map(
            (step) =>
              `<br><span class="muted">${DEFECT_STATUS_LABELS[step.status]}: ${escapeHtml(dateTimeText(step.at))}${
                step.by === undefined ? '' : `, ${cell(step.by)}`
              }</span>`,
          )
          .join('')}</td>
        <td>${cell(repairText)}</td>
      </tr>`;
    })
    .join('');

  const items = pack.maintenance.items
    .map(
      (i) => `<tr>
        <td>${cell(i.name)}</td>
        <td>${escapeHtml(dayText(i.dueDate))}</td>
        <td>${i.lastDone === undefined ? '' : escapeHtml(dayText(i.lastDone))}</td>
        <td>${ITEM_STATE_LABELS[i.state]}</td>
      </tr>`,
    )
    .join('');

  const done = pack.maintenance.done
    .map(
      (d) => `<tr>
        <td>${cell(d.item)}</td>
        <td>${escapeHtml(dayText(d.doneOn))}</td>
        <td>${escapeHtml(dayText(d.nextDue))}</td>
        <td>${cell(d.by)}</td>
        <td>${cell(d.note)}</td>
      </tr>`,
    )
    .join('');

  const changes = pack.maintenance.changes
    .map(
      (c) => `<tr>
        <td>${escapeHtml(dateTimeText(c.at))}</td>
        <td>${cell(c.item)}</td>
        <td>${c.from === undefined ? '<span class="muted">No date before</span>' : escapeHtml(dayText(c.from))}</td>
        <td>${escapeHtml(dayText(c.to))}</td>
        <td>${cell(c.by)}</td>
      </tr>`,
    )
    .join('');

  const timeline = pack.timeline
    .map(
      (e) => `<tr>
        <td>${escapeHtml(eventWhen(e))}</td>
        <td>${EVENT_LABELS[e.kind]}</td>
        <td>${cell(e.title)}${e.detail === undefined ? '' : `<br><span class="muted">${cell(e.detail)}</span>`}</td>
        <td>${cell(e.who)}</td>
      </tr>`,
    )
    .join('');

  const empty = (text: string, columns: number): string =>
    `<tr><td colspan="${columns}" class="muted">${escapeHtml(text)}</td></tr>`;

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 13px/1.45 system-ui, sans-serif; color: #111; max-width: 900px; margin: 28px auto; padding: 0 16px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 6px; }
  .muted { color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  th, td { text-align: left; padding: 6px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 12px; color: #444; border-bottom: 2px solid #999; }
  .num { text-align: right; white-space: nowrap; }
  ul { margin: 6px 0; padding-left: 20px; }
  .notes { margin-top: 28px; padding: 10px 12px; background: #f5f5f5; border-radius: 6px; }
  tr { break-inside: avoid; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>Vehicle audit pack</h1>
<div><strong>${escapeHtml(vehicle.name)}</strong>${vehicle.registration === undefined ? '' : `, ${escapeHtml(vehicle.registration)}`}${vehicle.company === undefined ? '' : ` · ${escapeHtml(vehicle.company)}`}</div>
<div class="muted">${escapeHtml(dayText(pack.range.from))} to ${escapeHtml(dayText(pack.range.to))} · made ${escapeHtml(dateTimeText(pack.generatedAt))}</div>

<h2>In short</h2>
<ul>${summaryLines(pack)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('')}</ul>

<h2>Walk-round checks</h2>
<table>
  <thead><tr><th>When</th><th>List</th><th>Done by</th><th>Result</th><th class="num">Defects</th></tr></thead>
  <tbody>${checks || empty('No checks were recorded in this period.', 5)}</tbody>
</table>

<h2>Defects and repairs</h2>
<table>
  <thead><tr><th>Found</th><th>What</th><th>How serious</th><th>Status</th><th>Repair</th></tr></thead>
  <tbody>${defects || empty('No defects in this period, and none still open.', 5)}</tbody>
</table>

<h2>Maintenance dates today</h2>
<table>
  <thead><tr><th>Item</th><th>Next due</th><th>Last done</th><th>Where it stands</th></tr></thead>
  <tbody>${items || empty('No maintenance dates are kept for this vehicle.', 4)}</tbody>
</table>

<h2>Maintenance done in this period</h2>
<table>
  <thead><tr><th>Item</th><th>Done on</th><th>Next due</th><th>Recorded by</th><th>Note</th></tr></thead>
  <tbody>${done || empty('Nothing was recorded as done in this period.', 5)}</tbody>
</table>

<h2>Due dates entered or corrected</h2>
<table>
  <thead><tr><th>When</th><th>Item</th><th>Date before</th><th>New date</th><th>By</th></tr></thead>
  <tbody>${changes || empty('No due date was entered or corrected by hand in this period.', 5)}</tbody>
</table>

<h2>Everything in order</h2>
<table>
  <thead><tr><th>When</th><th>Record</th><th>What</th><th>Who</th></tr></thead>
  <tbody>${timeline || empty('Nothing was recorded in this period.', 4)}</tbody>
</table>

<div class="notes">${REPORT_NOTES.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}</div>
</body>
</html>`;
}
