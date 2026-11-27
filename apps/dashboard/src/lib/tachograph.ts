import {
  downloadStatus,
  type DownloadState,
  type DownloadStatus,
  type TachographCardInfo,
  type TachographFileRow,
  type TachographKind,
} from '@wagonwise/contracts/tachograph';

/** One line of the download tracker: a driver card or a vehicle unit, and where it stands on downloads. */
export interface TrackerRow {
  readonly key: string;
  readonly kind: TachographKind;
  /** The driver's id or the vehicle's id. */
  readonly subjectId: string;
  readonly name: string;
  /** The day of the latest file we hold, when there is one. */
  readonly lastDownloadedOn: string | undefined;
  readonly lastFileId: string | undefined;
  readonly status: DownloadStatus;
  /** What the latest card file says about its card, when it read. From the card file, not the legal record. */
  readonly card: TachographCardInfo | undefined;
  readonly cardFlags: readonly CardFlag[];
}

/** Things in a card file worth a look: the card has run out or is about to, or the name on it is not the driver's. */
export type CardFlag = 'expired' | 'expires_soon' | 'name_differs';

/** A card is flagged this many days before it runs out, so there is time to renew it. */
export const CARD_EXPIRY_WARNING_DAYS = 60;

const DAY_MS = 86_400_000;

/** Days from `today` to the day the card runs out (negative once it has), both `YYYY-MM-DD`. */
export function daysToExpiry(expiresOn: string, today: string): number {
  return Math.round(
    (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
}

const words = (name: string): string[] =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);

/**
 * Whether the name on a card file and the driver it is filed under could be the same person: they share a name. It is a hint, not a
 * test (a nickname, a married name, a double-barrelled name can all differ), so it only says when nothing is shared at all.
 */
export function namesCouldMatch(driverName: string, holderName: string): boolean {
  const driver = new Set(words(driverName));
  const holder = words(holderName);
  // No name to compare, so nothing to say.
  return driver.size === 0 || holder.length === 0 || holder.some((w) => driver.has(w));
}

/** What a flag says, in plain words. */
export function cardFlagText(flag: CardFlag, card: TachographCardInfo, today: string): string {
  if (flag === 'name_differs') {
    return `The name in the file (${card.holderName}) is not this driver's: check it is the right file`;
  }
  const days = daysToExpiry(card.expiresOn, today);
  if (flag === 'expired') return 'Card has run out';
  return days === 0
    ? 'Card runs out today'
    : `Card runs out in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** How many driver cards have run out or are about to, and how many files carry another name. For a line above the list. */
export function cardFlagCounts(rows: readonly TrackerRow[]): {
  readonly expiry: number;
  readonly nameDiffers: number;
} {
  return {
    expiry: rows.filter(
      (r) => r.cardFlags.includes('expired') || r.cardFlags.includes('expires_soon'),
    ).length,
    nameDiffers: rows.filter((r) => r.cardFlags.includes('name_differs')).length,
  };
}

/** What is worth a look in a driver's latest card file. */
export function cardFlags(
  driverName: string,
  card: TachographCardInfo | undefined,
  today: string,
): CardFlag[] {
  if (card === undefined) return [];
  const flags: CardFlag[] = [];
  const days = daysToExpiry(card.expiresOn, today);
  if (days < 0) flags.push('expired');
  else if (days <= CARD_EXPIRY_WARNING_DAYS) flags.push('expires_soon');
  if (!namesCouldMatch(driverName, card.holderName)) flags.push('name_differs');
  return flags;
}

export interface Subject {
  readonly id: string;
  readonly name: string;
}

/** Overdue first, then due soon, then no file yet, then the rest, each by name. A firm looks at the top of the list. */
const ORDER: Record<DownloadState, number> = { overdue: 0, due_soon: 1, no_file: 2, ok: 3 };

/**
 * The tracker: every driver and every vehicle the firm has, each with the latest file we hold and what that means for the next
 * download. A driver or vehicle with no file is shown as "No file yet" rather than left out, so a gap is visible. It reflects the
 * files sent to us only: a download made and not uploaded does not appear.
 */
export function trackerRows(
  drivers: readonly Subject[],
  vehicles: readonly Subject[],
  latest: readonly TachographFileRow[],
  today: string,
): TrackerRow[] {
  const byCard = new Map(
    latest.filter((f) => f.kind === 'driver_card').map((f) => [f.driverId, f]),
  );
  const byUnit = new Map(
    latest.filter((f) => f.kind === 'vehicle_unit').map((f) => [f.vehicleId, f]),
  );
  const make = (
    kind: TachographKind,
    subject: Subject,
    file: TachographFileRow | undefined,
  ): TrackerRow => ({
    key: `${kind}:${subject.id}`,
    kind,
    subjectId: subject.id,
    name: subject.name,
    lastDownloadedOn: file?.downloadedOn,
    lastFileId: file?.id,
    status: downloadStatus(kind, file?.downloadedOn, today),
    card: file?.card,
    cardFlags: kind === 'driver_card' ? cardFlags(subject.name, file?.card, today) : [],
  });
  const rows = [
    ...drivers.map((d) => make('driver_card', d, byCard.get(d.id))),
    ...vehicles.map((v) => make('vehicle_unit', v, byUnit.get(v.id))),
  ];
  return rows.sort(
    (a, b) =>
      ORDER[a.status.state] - ORDER[b.status.state] ||
      (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

export const STATE_LABELS: Record<DownloadState, string> = {
  no_file: 'No file yet',
  ok: 'Not due yet',
  due_soon: 'Due soon',
  overdue: 'Overdue',
};

/** "Due by 12 Dec (in 16 days)" or "Was due 28 Nov (3 days ago)". Says nothing when there is no file. */
export function dueText(status: DownloadStatus): string {
  if (status.dueOn === undefined || status.daysLeft === undefined) return '';
  const date = new Date(`${status.dueOn}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const n = Math.abs(status.daysLeft);
  const days = `${n} ${n === 1 ? 'day' : 'days'}`;
  if (status.daysLeft < 0) return `Was due ${date} (${days} ago)`;
  if (status.daysLeft === 0) return `Due today, ${date}`;
  return `Due by ${date} (in ${days})`;
}

/** How many of the rows need a download now: overdue or with no file yet. For a line above the list. */
export function needsAction(rows: readonly TrackerRow[]): number {
  return rows.filter((r) => r.status.state === 'overdue' || r.status.state === 'no_file').length;
}

/** How many driver cards and vehicle units are overdue, due soon, or have no file yet. For the line on the home page. */
export interface DownloadCounts {
  readonly overdue: number;
  readonly dueSoon: number;
  readonly noFile: number;
}

export function downloadCounts(rows: readonly TrackerRow[]): DownloadCounts {
  const count = (state: DownloadState) => rows.filter((r) => r.status.state === state).length;
  return { overdue: count('overdue'), dueSoon: count('due_soon'), noFile: count('no_file') };
}

/** A size in the units a person reads: "280 KB", "2.4 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** The file's bytes, as a browser can save them. */
export function base64ToBlob(dataBase64: string): Blob {
  const raw = atob(dataBase64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: 'application/octet-stream' });
}

/** A file picked in the browser, as base64 (without the `data:` prefix). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}
