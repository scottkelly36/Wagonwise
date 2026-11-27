import type { Id } from '../../../shared/brand.js';
import type { TaggedError } from '../../../shared/result.js';

export type CompanyId = Id<'CompanyId'>;
export type DriverId = Id<'DriverId'>;
export type StaffId = Id<'StaffId'>;

export type FileKind = 'driver_card' | 'vehicle_unit';
export type FileSource = 'driver_app' | 'office';

/** What a driver card file says about its card (`readCardIdentity`), kept beside the file so the portal need not open it. */
export interface FileCardInfo {
  readonly cardNumber: string;
  readonly holderName: string;
  /** The day the card runs out, `YYYY-MM-DD`. */
  readonly expiresOn: string;
  readonly generations: string;
}

/** A file's details without its bytes: what the portal lists. */
export interface FileSummary {
  readonly id: string;
  readonly companyId: CompanyId;
  readonly kind: FileKind;
  readonly driverId?: string | undefined;
  readonly vehicleId?: string | undefined;
  readonly fileName: string;
  readonly sizeBytes: number;
  /** The day the download was made, `YYYY-MM-DD`, as the uploader said. */
  readonly downloadedOn: string;
  readonly receivedAt: Date;
  readonly source: FileSource;
  /** Absent for a vehicle unit file, a file received before this was read, or one that did not read as a driver card download. */
  readonly card?: FileCardInfo | undefined;
}

/** A file to be stored: the bytes exactly as received, and the hash they were checked against. */
export interface NewFile {
  readonly id: string;
  readonly companyId: CompanyId;
  readonly kind: FileKind;
  readonly driverId?: DriverId | undefined;
  readonly vehicleId?: string | undefined;
  readonly fileName: string;
  readonly data: Buffer;
  readonly sha256: string;
  readonly downloadedOn: string;
  readonly receivedAt: Date;
  readonly uploadedByDriverId?: DriverId | undefined;
  readonly uploadedByStaffId?: StaffId | undefined;
  readonly wordingVersion?: number | undefined;
  readonly card?: FileCardInfo | undefined;
}

export interface StoredFile {
  readonly summary: FileSummary;
  readonly data: Buffer;
  readonly sha256: string;
}

export interface FirmSettings {
  readonly driversMaySend: boolean;
  readonly retentionMonths: number;
  readonly remindersEnabled: boolean;
}

export const DEFAULT_SETTINGS: FirmSettings = {
  driversMaySend: false,
  retentionMonths: 12,
  remindersEnabled: true,
};

export interface InvalidFile extends TaggedError<'InvalidFile'> {
  readonly reason: 'empty' | 'too_big' | 'bad_date' | 'bad_name';
}

// eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** The name a file is kept under: the name only (no folders), no control characters, at most 120 characters. Nothing else about the
 *  file is changed. */
export function cleanFileName(raw: string): string | null {
  const last = raw.split(/[\\/]/).pop() ?? '';
  const name = last.replace(CONTROL_CHARACTERS, '').trim().slice(0, 120);
  return name === '' || name === '.' || name === '..' ? null : name;
}

/** A real calendar date, not later than tomorrow (a phone's clock may run a day ahead of the UK's) and not before 2000. */
export function validDownloadDate(isoDate: string, now: Date): boolean {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) return false;
  const latest = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  return isoDate <= latest && isoDate >= '2000-01-01';
}
