import { daysBetween, type DayString, type OverviewRow } from './maintenance.js';

/** How a person is told: an email each morning, or only by looking at the portal. */
export type Channel = 'email' | 'none';
export const CHANNELS: readonly Channel[] = ['email', 'none'];
export const DEFAULT_CHANNEL: Channel = 'email';

export const isChannel = (value: string): value is Channel =>
  (CHANNELS as readonly string[]).includes(value);

/** What a reminder is about: something overdue, or due within its warning period. A missing date is not a reminder. */
export const needsReminder = (row: Pick<OverviewRow, 'status'>): boolean =>
  row.status === 'overdue' || row.status === 'due_soon';

/** The hour in UK time (0 to 23). */
export function ukHour(at: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hour12: false,
  }).format(at);
  return Number(hour) % 24;
}

/** Reminders go out from this hour in the morning, UK time, and not before. */
export const FIRST_REMINDER_HOUR = 7;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWords = (day: DayString): string => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const vehicleWords = (row: OverviewRow): string =>
  row.registration === undefined ? row.vehicleName : `${row.vehicleName} (${row.registration})`;

function lineFor(row: OverviewRow): string {
  const when =
    row.daysUntil === undefined || row.dueDate === undefined
      ? ''
      : row.daysUntil < 0
        ? `overdue by ${plural(-row.daysUntil, 'day')} (was due ${dayWords(row.dueDate)})`
        : row.daysUntil === 0
          ? 'due today'
          : `due in ${plural(row.daysUntil, 'day')} (${dayWords(row.dueDate)})`;
  return `  ${vehicleWords(row)}: ${row.itemName}, ${when}`;
}

export interface Reminder {
  readonly subject: string;
  readonly text: string;
}

/**
 * The morning email for one person: what is overdue, then what is due soon, in plain text. `undefined` when there is
 * nothing to say, so a quiet day sends nothing. `dashboardUrl` adds a link to the Maintenance page when it is known.
 */
export function buildReminder(input: {
  readonly name: string;
  readonly companyName: string;
  readonly rows: readonly OverviewRow[];
  readonly dashboardUrl: string | undefined;
}): Reminder | undefined {
  const overdue = input.rows.filter((r) => r.status === 'overdue');
  const soon = input.rows.filter((r) => r.status === 'due_soon');
  if (overdue.length === 0 && soon.length === 0) return undefined;

  const parts: string[] = [];
  if (overdue.length > 0) parts.push(`${overdue.length} overdue`);
  if (soon.length > 0) parts.push(`${soon.length} due soon`);
  const subject = `Maintenance: ${parts.join(', ')} (${input.companyName})`;

  const lines = [`Hi ${input.name},`, ''];
  if (overdue.length > 0) {
    lines.push('Overdue:', ...overdue.map(lineFor), '');
  }
  if (soon.length > 0) {
    lines.push('Due soon:', ...soon.map(lineFor), '');
  }
  if (input.dashboardUrl !== undefined) {
    const base = input.dashboardUrl.replace(/\/+$/, '');
    lines.push(`Update them here: ${base}/fleet/maintenance`, '');
  }
  lines.push(
    'You get this email each morning while something needs attention. You can switch it off, or choose to look in the portal instead, on the Maintenance page.',
    '',
    'WagonWise',
  );
  return { subject, text: lines.join('\n') };
}

export { daysBetween };
