import {
  DOWNLOAD_EVERY_DAYS,
  MAX_TACHOGRAPH_FILE_BYTES,
  downloadStatus,
  type DownloadStatus,
} from '@wagonwise/contracts/tachograph';

/** The UK calendar day, `YYYY-MM-DD`. */
export function ukDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(at);
}

/**
 * The day to record for a file the driver picked: the day the file was last changed, which for a file saved by a download tool is the
 * day of the download. Never later than today, and today when the phone does not say.
 */
export function downloadedDay(lastModifiedMs: number | undefined, now: Date): string {
  const today = ukDay(now);
  if (lastModifiedMs === undefined || !Number.isFinite(lastModifiedMs) || lastModifiedMs <= 0) {
    return today;
  }
  const day = ukDay(new Date(lastModifiedMs));
  return day > today ? today : day;
}

/** Whether the picked file can be sent, and what to tell the driver when it cannot. */
export function fileProblem(sizeBytes: number | undefined): string | undefined {
  if (sizeBytes === 0) return 'That file is empty.';
  if (sizeBytes !== undefined && sizeBytes > MAX_TACHOGRAPH_FILE_BYTES) {
    return `That file is too big (${Math.round(sizeBytes / 1_000_000)} MB). A driver card file is usually under 1 MB, so check you picked the right one.`;
  }
  return undefined;
}

/** "280 KB". */
export function sizeText(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** "25 Nov 2026". */
export function dayText(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The driver's card download, from the day of the last file they sent to a company. Says what we hold, never that they are fine. */
export function cardStatus(lastDownloadedOn: string | undefined, now: Date): DownloadStatus {
  return downloadStatus('driver_card', lastDownloadedOn, ukDay(now));
}

/** What the driver is told about their last file and the next one. */
export function statusText(lastDownloadedOn: string | undefined, now: Date): string {
  if (lastDownloadedOn === undefined) return 'You have not sent a file here yet.';
  const status = cardStatus(lastDownloadedOn, now);
  const last = `Last file sent: downloaded ${dayText(lastDownloadedOn)}.`;
  if (status.state === 'overdue') {
    return `${last} A new download was due by ${dayText(status.dueOn ?? lastDownloadedOn)}.`;
  }
  return `${last} The next is due by ${dayText(status.dueOn ?? lastDownloadedOn)}.`;
}

/** The notice shown before a file is sent. Bump `TACHOGRAPH_WORDING_VERSION` in contracts when it changes. */
export function sendNotice(companyName: string): readonly string[] {
  return [
    `This file goes to ${companyName}. It holds a record of your driving and rest times, which your company has to keep and may have to show to DVSA.`,
    `Only ${companyName} can see it, and WagonWise support if they are helping with a problem. WagonWise does not open the file.`,
    `${companyName} keeps it for at least 12 months. If you delete your WagonWise account, the company still holds the copy it was sent.`,
  ];
}

/**
 * Shown to a driver whose company is not on WagonWise yet. It says what the office gets and where to find out more; it names no price and
 * makes no promise about the law, and the driver chooses whether to tell anyone.
 */
export const INTEREST_HEADING = 'Want your firm to see this too?';
export const INTEREST_TEXT =
  'In the WagonWise portal your company sees when each driver’s card download is due, gets a reminder before it is late, and keeps the files in one place. It is made for haulage firms and is free to try.';
export const INTEREST_BOSS_BUTTON = 'Tell your boss about it';
export const INTEREST_OWN_FIRM_LINK = 'Run your own firm? Start a free trial';

export const INTERVAL_TEXT = `Your company needs a copy of your driver card at least every ${DOWNLOAD_EVERY_DAYS.driver_card} days.`;
