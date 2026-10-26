import { daysBetween, type DayString, type OverviewRow } from './maintenance.js';

/** How a person is told: an email each morning, or only by looking at the portal. */
export type Channel = 'email' | 'none';
export const CHANNELS: readonly Channel[] = ['email', 'none'];
export const DEFAULT_CHANNEL: Channel = 'email';

export const isChannel = (value: string): value is Channel =>
  (CHANNELS as readonly string[]).includes(value);

/** How a company's reminders go: email, text or both. A person with no mobile number (or a company past its monthly text
 *  limit) gets the email instead, so nobody is missed. */
export type CompanyChannel = 'email' | 'text' | 'both';
export const COMPANY_CHANNELS: readonly CompanyChannel[] = ['email', 'text', 'both'];
export const DEFAULT_COMPANY_CHANNEL: CompanyChannel = 'email';

export const isCompanyChannel = (value: string): value is CompanyChannel =>
  (COMPANY_CHANNELS as readonly string[]).includes(value);

/** The most reminder texts one company is sent in a calendar month: past it, reminders go by email. A text costs a few pence. */
export const REMINDER_TEXTS_PER_MONTH = 100;

/** The calendar month in UK time, like "2026-10". */
export function ukMonth(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

/**
 * A UK mobile number in the form +447700900123, from however it was typed (07700 900123, +44 7700 900123, 0044 7700 900123),
 * or `undefined` if it is not one. Only mobiles (07 followed by nine digits, not the 070 personal-number range) can be texted.
 */
export function normaliseUkMobile(raw: string): string | undefined {
  let digits = raw.replace(/[\s().-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0044')) digits = digits.slice(2);
  // +44 (0)7700 900123 and +44 7700 900123 both mean 07700 900123.
  if (digits.startsWith('44')) digits = `0${digits.slice(2).replace(/^0/, '')}`;
  return /^07[1-57-9]\d{8}$/.test(digits) ? `+44${digits.slice(1)}` : undefined;
}

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

/**
 * The reminder as one short text (under 160 characters, so one message): how many are overdue and due soon, and where to look.
 * `undefined` when there is nothing to say. No vehicle details: a text is short, and the portal has them.
 */
export function buildTextReminder(input: {
  readonly companyName: string;
  readonly rows: readonly OverviewRow[];
}): string | undefined {
  const overdue = input.rows.filter((r) => r.status === 'overdue').length;
  const soon = input.rows.filter((r) => r.status === 'due_soon').length;
  if (overdue === 0 && soon === 0) return undefined;
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (soon > 0) parts.push(`${soon} due soon`);
  const company =
    input.companyName.length > 40 ? `${input.companyName.slice(0, 39)}…` : input.companyName;
  return `WagonWise maintenance: ${parts.join(', ')} (${company}). Open the portal for details.`;
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
