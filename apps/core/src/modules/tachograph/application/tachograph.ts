import { createHash } from 'node:crypto';
import { MAX_TACHOGRAPH_FILE_BYTES } from '@wagonwise/contracts/tachograph';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { readCardIdentity } from '../domain/card-identity.js';
import {
  cleanFileName,
  validDownloadDate,
  type CompanyId,
  type DriverId,
  type FileCardInfo,
  type FileKind,
  type FileSummary,
  type FirmSettings,
  type InvalidFile,
  type StaffId,
} from '../domain/tachograph.js';
import type {
  CompanyAccounts,
  CompanyRoster,
  DriverCompanies,
  FileRepository,
  SettingsRepository,
  StaffCaller,
} from './ports.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** The driver is not an active member of that company. */
export type CompanyNotFound = TaggedError<'CompanyNotFound'>;
/** The firm has not switched on drivers sending files from the app, or its account is paused. */
export type FirmNotEnabled = TaggedError<'FirmNotEnabled'>;
/** The driver is not one of the company's drivers, or the vehicle is not one of its vehicles. */
export type SubjectNotFound = TaggedError<'SubjectNotFound'>;
export type FileNotFound = TaggedError<'FileNotFound'>;

export interface TachographDeps {
  readonly settings: SettingsRepository;
  readonly files: FileRepository;
  readonly companies: DriverCompanies;
  readonly roster: CompanyRoster;
  /** Without it nothing is held back; composition always supplies it. */
  readonly accounts?: CompanyAccounts | undefined;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** How many recent files the portal lists. */
export const RECENT_FILES = 100;

/**
 * Whoever manages the fleet (or WagonWise) reads, uploads, deletes and sets the firm's choices. A driver card file holds a person's
 * working record, so it is not shown to everyone on the staff.
 */
export const canManage = (caller: StaffCaller, companyId: CompanyId): boolean =>
  caller.kind === 'platform' ||
  (caller.companyId === companyId && caller.privileges.includes('manage_fleet'));

// --- reading the bytes -----------------------------------------------------------------------------------------------------

interface Decoded {
  readonly fileName: string;
  readonly data: Buffer;
  readonly sha256: string;
}

/**
 * The bytes exactly as sent, with their SHA-256. The content is not judged: a file is never refused for what is in it, because a wrong
 * refusal is worse than keeping a file that turns out to be the wrong one. A driver card file is read for the card and its holder
 * (`cardOf`) as a courtesy, and a file that does not read is kept all the same.
 */
function decode(
  raw: { fileName: string; dataBase64: string; downloadedOn: string },
  now: Date,
): Result<Decoded, InvalidFile> {
  const fileName = cleanFileName(raw.fileName);
  if (fileName === null) return err({ tag: 'InvalidFile', reason: 'bad_name' });
  if (!validDownloadDate(raw.downloadedOn, now)) {
    return err({ tag: 'InvalidFile', reason: 'bad_date' });
  }
  const data = Buffer.from(raw.dataBase64, 'base64');
  if (data.length === 0) return err({ tag: 'InvalidFile', reason: 'empty' });
  if (data.length > MAX_TACHOGRAPH_FILE_BYTES) {
    return err({ tag: 'InvalidFile', reason: 'too_big' });
  }
  return ok({ fileName, data, sha256: createHash('sha256').update(data).digest('hex') });
}

/** What a driver card file says about its card, or nothing when it does not read as one. */
function cardOf(data: Buffer): FileCardInfo | undefined {
  return readCardIdentity(data);
}

// --- the firm's choices ----------------------------------------------------------------------------------------------------

export async function getFirmSettings(
  deps: Pick<TachographDeps, 'settings'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<FirmSettings, Forbidden>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.settings.get(companyId));
}

export async function setFirmSettings(
  deps: Pick<TachographDeps, 'settings' | 'clock'>,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  settings: FirmSettings,
): Promise<Result<FirmSettings, Forbidden>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  await deps.settings.set(companyId, settings, staffId, deps.clock.now());
  return ok(settings);
}

// --- the office ------------------------------------------------------------------------------------------------------------

export interface UploadInput {
  readonly kind: FileKind;
  readonly driverId?: string | undefined;
  readonly vehicleId?: string | undefined;
  readonly fileName: string;
  readonly downloadedOn: string;
  readonly dataBase64: string;
}

/**
 * The office uploads a file from whatever tool it uses. The driver must be one of the company's drivers, or the vehicle one of its
 * vehicles.
 */
export async function uploadFile(
  deps: TachographDeps,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  input: UploadInput,
): Promise<Result<{ duplicate: boolean }, Forbidden | SubjectNotFound | InvalidFile>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  const decoded = decode(input, deps.clock.now());
  if (!decoded.ok) return decoded;
  if (input.kind === 'driver_card') {
    if (
      input.driverId === undefined ||
      !(await deps.roster.isActiveDriver(companyId, input.driverId))
    ) {
      return err({ tag: 'SubjectNotFound' });
    }
  } else if (
    input.vehicleId === undefined ||
    !(await deps.roster.hasVehicle(companyId, input.vehicleId))
  ) {
    return err({ tag: 'SubjectNotFound' });
  }
  const result = await deps.files.add({
    id: deps.ids.newId(),
    companyId,
    kind: input.kind,
    driverId: input.kind === 'driver_card' ? (input.driverId as DriverId) : undefined,
    vehicleId: input.kind === 'vehicle_unit' ? input.vehicleId : undefined,
    ...decoded.value,
    downloadedOn: input.downloadedOn,
    receivedAt: deps.clock.now(),
    uploadedByStaffId: staffId,
    card: input.kind === 'driver_card' ? cardOf(decoded.value.data) : undefined,
  });
  return ok({ duplicate: result === 'duplicate' });
}

export async function listFiles(
  deps: Pick<TachographDeps, 'files'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<{ latest: FileSummary[]; recent: FileSummary[] }, Forbidden>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok({
    latest: await deps.files.latestPerSubject(companyId),
    recent: await deps.files.recent(companyId, RECENT_FILES),
  });
}

/** The file exactly as it was received, so it can be handed on unaltered. */
export async function downloadFile(
  deps: Pick<TachographDeps, 'files'>,
  caller: StaffCaller,
  companyId: CompanyId,
  fileId: string,
): Promise<Result<{ fileName: string; data: Buffer; sha256: string }, Forbidden | FileNotFound>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  const found = await deps.files.find(companyId, fileId);
  if (found === null) return err({ tag: 'FileNotFound' });
  return ok({ fileName: found.summary.fileName, data: found.data, sha256: found.sha256 });
}

export async function deleteFile(
  deps: Pick<TachographDeps, 'files'>,
  caller: StaffCaller,
  companyId: CompanyId,
  fileId: string,
): Promise<Result<void, Forbidden | FileNotFound>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  return (await deps.files.remove(companyId, fileId))
    ? ok(undefined)
    : err({ tag: 'FileNotFound' });
}

// --- the driver ------------------------------------------------------------------------------------------------------------

export interface MineRow {
  readonly companyId: CompanyId;
  readonly companyName: string;
  readonly firmEnabled: boolean;
  readonly lastDownloadedOn: string | undefined;
}

/** The firm takes card files from the app: it has chosen so, and its account is not paused. */
async function firmTakesFiles(
  deps: Pick<TachographDeps, 'settings' | 'accounts'>,
  companyId: CompanyId,
): Promise<boolean> {
  if (!(await deps.settings.get(companyId)).driversMaySend) return false;
  return deps.accounts === undefined || (await deps.accounts.pausedCompanyName(companyId)) === null;
}

/** Each company the driver drives for, whether it takes card files from the app, and the day of the driver's latest file there. */
export async function listMine(
  deps: TachographDeps,
  driverId: DriverId,
  identifier: string,
): Promise<MineRow[]> {
  const companies = await deps.companies.activeCompanies(driverId, identifier);
  const rows: MineRow[] = [];
  for (const company of companies) {
    rows.push({
      companyId: company.id,
      companyName: company.name,
      firmEnabled: await firmTakesFiles(deps, company.id),
      lastDownloadedOn: await deps.files.latestCardDay(company.id, driverId),
    });
  }
  return rows;
}

/**
 * A driver sends their own card file to a firm they drive for. Sending is the driver's act each time, after the app has shown who
 * receives it; there is no standing agreement.
 */
export async function sendMyFile(
  deps: TachographDeps,
  driverId: DriverId,
  identifier: string,
  companyId: CompanyId,
  input: {
    fileName: string;
    downloadedOn: string;
    dataBase64: string;
    wordingVersion?: number | undefined;
  },
): Promise<Result<{ duplicate: boolean }, CompanyNotFound | FirmNotEnabled | InvalidFile>> {
  const mine = await deps.companies.activeCompanies(driverId, identifier);
  if (!mine.some((c) => c.id === companyId)) return err({ tag: 'CompanyNotFound' });
  if (!(await firmTakesFiles(deps, companyId))) return err({ tag: 'FirmNotEnabled' });
  const decoded = decode(input, deps.clock.now());
  if (!decoded.ok) return decoded;
  const result = await deps.files.add({
    id: deps.ids.newId(),
    companyId,
    kind: 'driver_card',
    driverId,
    ...decoded.value,
    downloadedOn: input.downloadedOn,
    receivedAt: deps.clock.now(),
    uploadedByDriverId: driverId,
    wordingVersion: input.wordingVersion,
    card: cardOf(decoded.value.data),
  });
  return ok({ duplicate: result === 'duplicate' });
}

// --- housekeeping ----------------------------------------------------------------------------------------------------------

/** Deletes files past each firm's retention (never under 12 months). */
export function pruneExpired(deps: Pick<TachographDeps, 'files' | 'clock'>): Promise<number> {
  return deps.files.deleteExpired(deps.clock.now());
}
