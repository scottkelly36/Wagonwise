import {
  DOWNLOAD_EVERY_DAYS,
  DUE_SOON_DAYS,
  type DownloadStatus,
  type TachographKind,
} from '@wagonwise/contracts/tachograph';

/** How far along a download is, for deciding whether to remind. Each stage is sent once for a download. */
export type ReminderStage = 'soon' | 'urgent' | 'today' | `overdue-${number}`;

/** Reminders go out from this hour in the morning, UK time, and not before. */
export const FIRST_REMINDER_HOUR = 7;

/**
 * The stage a driver card or vehicle unit has reached, or `undefined` when it is not time to say anything. Due soon is the last
 * week, urgent the last two days, then the day itself, then once each week it stays overdue. A server that was down for a while
 * skips to the stage it is now at, not through the ones it missed.
 */
export function reminderStage(status: DownloadStatus): ReminderStage | undefined {
  const left = status.daysLeft;
  if (left === undefined) return undefined;
  if (left < 0) return `overdue-${Math.floor((-left - 1) / 7)}`;
  if (left === 0) return 'today';
  if (left <= 2) return 'urgent';
  if (left <= DUE_SOON_DAYS) return 'soon';
  return undefined;
}

/** One driver card or vehicle unit with a reminder to send. */
export interface DueItem {
  readonly kind: TachographKind;
  /** The driver's id for a card, the vehicle's id for a unit. */
  readonly subjectId: string;
  /** The day of the download this follows. */
  readonly downloadedOn: string;
  readonly stage: ReminderStage;
  readonly dueOn: string;
  readonly daysLeft: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayWords(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What is due, in a few words: "due by 18 Dec 2026", "due today", "3 days overdue". */
export function dueWords(item: Pick<DueItem, 'daysLeft' | 'dueOn'>): string {
  if (item.daysLeft < 0) return `${plural(-item.daysLeft, 'day', 'days')} overdue`;
  if (item.daysLeft === 0) return 'due today';
  return `due by ${dayWords(item.dueOn)}`;
}

/** The push a driver gets about their own card. */
export function driverPush(item: DueItem): { title: string; body: string } {
  const title = item.daysLeft < 0 ? 'Tachograph download overdue' : 'Tachograph download due';
  return {
    title,
    body: `Your driver card download is ${dueWords(item)}. Open More, then Send my tachograph file, to send your latest.`,
  };
}

/** A line of the email to the office. */
export interface NamedItem extends DueItem {
  readonly name: string;
}

/** The email to a person who manages the fleet: what is coming due or overdue. */
export function officeEmail(input: {
  readonly personName: string;
  readonly companyName: string;
  readonly items: readonly NamedItem[];
  readonly dashboardUrl: string | undefined;
}): { subject: string; text: string } {
  const overdue = input.items.filter((i) => i.daysLeft < 0);
  const subject =
    overdue.length > 0
      ? `Tachograph downloads overdue: ${input.companyName}`
      : `Tachograph downloads due soon: ${input.companyName}`;
  const line = (i: NamedItem): string =>
    `- ${i.name} (${i.kind === 'driver_card' ? 'driver card' : 'vehicle unit'}): ${dueWords(i)}. Last download we hold: ${dayWords(i.downloadedOn)}.`;
  const text = [
    `Hello ${input.personName},`,
    '',
    `These tachograph downloads for ${input.companyName} are coming due or overdue:`,
    '',
    ...input.items.map(line),
    '',
    `A driver card needs downloading at least every ${DOWNLOAD_EVERY_DAYS.driver_card} days and a vehicle unit at least every ${DOWNLOAD_EVERY_DAYS.vehicle_unit} days. This only knows about files sent to WagonWise: if you have already downloaded and not uploaded it, upload it and this stops.`,
    ...(input.dashboardUrl === undefined
      ? []
      : ['', `Upload a file: ${input.dashboardUrl.replace(/\/$/, '')}/fleet/tachograph`]),
    '',
    'You can turn these reminders off on the Tachograph files page. This is a reminder, not a statement that you are meeting your duties.',
    '',
    'WagonWise',
  ].join('\n');
  return { subject, text };
}
