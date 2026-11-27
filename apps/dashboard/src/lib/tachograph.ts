import {
  downloadStatus,
  type DownloadState,
  type DownloadStatus,
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
