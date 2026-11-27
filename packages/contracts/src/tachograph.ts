import { z } from 'zod';

/**
 * Tachograph files: a copy of a driver card or a vehicle unit, kept unaltered for the firm. Sent from the driver app (a driver's own
 * card) or uploaded in the portal (either), and tracked so the office can see which downloads are coming due.
 *
 * The intervals are the ones GOV.UK gives operators ("Drivers' hours: goods vehicles", responsibilities of vehicle operators, checked
 * 2026-11-26): download a vehicle unit at least every 90 days and a driver card at least every 28 days, and be able to produce records
 * for 12 months. They are named here so there is one place to change them.
 */

/** The wording version a driver agreed to when sending a file; bumped when the notice in the app changes. */
export const TACHOGRAPH_WORDING_VERSION = 1;

export const tachographKindSchema = z.enum(['driver_card', 'vehicle_unit']);
export type TachographKind = z.infer<typeof tachographKindSchema>;

/** Days between downloads, at most. */
export const DOWNLOAD_EVERY_DAYS: Readonly<Record<TachographKind, number>> = {
  driver_card: 28,
  vehicle_unit: 90,
};

/** A download is "due soon" this many days before it must be done. */
export const DUE_SOON_DAYS = 7;

/** A firm keeps files for at least this long (months): the 12 months records must be producible for. */
export const MIN_RETENTION_MONTHS = 12;
export const MAX_RETENTION_MONTHS = 120;
export const DEFAULT_RETENTION_MONTHS = 12;

/** Largest file taken, in bytes. A driver card file is under a megabyte; a vehicle unit file is a few. Base64 adds a third, and the
 *  servers accept 10 MB bodies, so this leaves room. */
export const MAX_TACHOGRAPH_FILE_BYTES = 6_000_000;
const MAX_BASE64_CHARS = Math.ceil((MAX_TACHOGRAPH_FILE_BYTES * 4) / 3) + 8;

/** A date with no time, as `YYYY-MM-DD`. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type DownloadState = 'no_file' | 'ok' | 'due_soon' | 'overdue';

export interface DownloadStatus {
  readonly state: DownloadState;
  /** The date the next download is due by; absent when no file has been received. */
  readonly dueOn?: string;
  /** Days until it is due; negative once overdue. Absent when no file has been received. */
  readonly daysLeft?: number;
}

const DAY_MS = 86_400_000;
const dayNumber = (isoDate: string): number =>
  Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
const dateOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/**
 * Where a driver card or a vehicle unit stands on downloads, from the date of the latest file we hold. It says only what the files
 * we hold show: a download made and not sent to us is invisible, so this is a tracker, never a statement that anyone is up to date
 * with their duties. `today` is the UK calendar date.
 */
export function downloadStatus(
  kind: TachographKind,
  lastDownloadedOn: string | undefined,
  today: string,
): DownloadStatus {
  if (lastDownloadedOn === undefined) return { state: 'no_file' };
  const due = dayNumber(lastDownloadedOn) + DOWNLOAD_EVERY_DAYS[kind];
  const daysLeft = due - dayNumber(today);
  const state: DownloadState =
    daysLeft < 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'due_soon' : 'ok';
  return { state, dueOn: dateOf(due), daysLeft };
}

export const tachographCompanyParamsSchema = z.object({ companyId: z.string().min(1) });
export const tachographFileParamsSchema = z.object({
  companyId: z.string().min(1),
  fileId: z.uuid(),
});

/** `GET/PUT /staff/tachograph/companies/:companyId/settings`. */
export const tachographSettingsSchema = z.object({
  /** Whether drivers may send their card files from the app. Off until the firm chooses. */
  driversMaySend: z.boolean(),
  /** How long files are kept, in months. Never below the 12 months records must be producible for. */
  retentionMonths: z.number().int().min(MIN_RETENTION_MONTHS).max(MAX_RETENTION_MONTHS),
  /** Whether the office is emailed, and drivers who send files are pushed, when a download is coming due or overdue. On unless turned off. */
  remindersEnabled: z.boolean().default(true),
});
export type TachographSettingsDto = z.infer<typeof tachographSettingsSchema>;

const fileNameSchema = z.string().trim().min(1).max(200);
const dataSchema = z.base64().min(1).max(MAX_BASE64_CHARS);

/** `POST /staff/tachograph/companies/:companyId/files`: the office uploads a file from any download tool. */
export const uploadTachographFileRequestSchema = z
  .object({
    kind: tachographKindSchema,
    /** The driver whose card it is (a driver card file). */
    driverId: z.string().min(1).optional(),
    /** The company vehicle the unit is in (a vehicle unit file). */
    vehicleId: z.string().min(1).optional(),
    fileName: fileNameSchema,
    /** The day the download was made. Not read from the file. */
    downloadedOn: isoDateSchema,
    dataBase64: dataSchema,
  })
  .refine(
    (v) =>
      v.kind === 'driver_card'
        ? v.driverId !== undefined && v.vehicleId === undefined
        : v.vehicleId !== undefined && v.driverId === undefined,
    {
      message: 'a driver card file names a driver, and a vehicle unit file names a vehicle',
    },
  );
export type UploadTachographFileRequest = z.infer<typeof uploadTachographFileRequestSchema>;

/** `POST /tachograph/companies/:companyId/files`: a driver sends their own card file to a firm they drive for. */
export const sendMyTachographFileRequestSchema = z.object({
  fileName: fileNameSchema,
  downloadedOn: isoDateSchema,
  dataBase64: dataSchema,
  /** The notice the driver was shown. */
  wordingVersion: z.number().int().min(1).optional(),
});
export type SendMyTachographFileRequest = z.infer<typeof sendMyTachographFileRequestSchema>;

/** The answer to either upload. `duplicate` is true when the firm already held exactly this file, which is then left as it was. */
export const tachographStoredSchema = z.object({ duplicate: z.boolean() });

/** What a driver card file says about its card, read from the file when it was received. From the card file, not the legal record: a
 *  file that did not read has none. */
export const tachographCardInfoSchema = z.object({
  cardNumber: z.string(),
  /** As printed on the card: first names then surname. */
  holderName: z.string(),
  /** The day the card runs out. */
  expiresOn: isoDateSchema,
  /** Which generations of the card the file holds: `1`, `2` or `1,2`. */
  generations: z.enum(['1', '2', '1,2']),
});
export type TachographCardInfo = z.infer<typeof tachographCardInfoSchema>;

/** One file as the portal lists it (the bytes are fetched separately). */
export const tachographFileRowSchema = z.object({
  id: z.string(),
  kind: tachographKindSchema,
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  fileName: z.string(),
  sizeBytes: z.number().int(),
  downloadedOn: isoDateSchema,
  receivedAt: z.iso.datetime(),
  /** Whether it came from the driver app or was uploaded by the office. */
  source: z.enum(['driver_app', 'office']),
  card: tachographCardInfoSchema.optional(),
});
export type TachographFileRow = z.infer<typeof tachographFileRowSchema>;

/** `GET /staff/tachograph/companies/:companyId/files`. `latest` is the newest file for each driver card and each vehicle unit;
 *  `recent` is the newest files of all. */
export const tachographFilesResponseSchema = z.object({
  latest: z.array(tachographFileRowSchema),
  recent: z.array(tachographFileRowSchema),
});
export type TachographFilesResponse = z.infer<typeof tachographFilesResponseSchema>;

/** `GET /staff/tachograph/companies/:companyId/files/:fileId`: the file exactly as it was received, base64 over JSON. */
export const tachographFileDownloadSchema = z.object({
  fileName: z.string(),
  dataBase64: z.string(),
  sha256: z.string(),
});
export type TachographFileDownload = z.infer<typeof tachographFileDownloadSchema>;

/** `GET /tachograph/mine`: for each firm the driver drives for, whether the firm takes card files from the app, and the date of the
 *  driver's latest file sent to it. */
export const tachographMineRowSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  firmEnabled: z.boolean(),
  lastDownloadedOn: isoDateSchema.optional(),
});
export type TachographMineRow = z.infer<typeof tachographMineRowSchema>;
export const tachographMineResponseSchema = z.object({
  companies: z.array(tachographMineRowSchema),
});
export type TachographMineResponse = z.infer<typeof tachographMineResponseSchema>;
