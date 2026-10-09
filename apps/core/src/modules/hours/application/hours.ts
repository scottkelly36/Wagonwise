import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  isFresh,
  STALE_MS,
  validateStatus,
  WORDING_VERSION,
  type CompanyId,
  type DriverId,
  type HoursStatus,
  type InvalidStatus,
  type StaffId,
} from '../domain/hours.js';
import type {
  ActiveJobs,
  DriverCompanies,
  SettingsRepository,
  SharingRepository,
  StaffCaller,
  StatusRepository,
} from './ports.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** The driver is not an active member of that company. */
export type CompanyNotFound = TaggedError<'CompanyNotFound'>;
/** The firm has not switched the feature on. */
export type FirmNotEnabled = TaggedError<'FirmNotEnabled'>;
/** The driver is not on a job, so there is nothing to share. */
export type NotOnAJob = TaggedError<'NotOnAJob'>;
/** One of the two switches is off, so nothing is stored. */
export type NotSharing = TaggedError<'NotSharing'>;

export interface HoursDeps {
  readonly settings: SettingsRepository;
  readonly sharing: SharingRepository;
  readonly statuses: StatusRepository;
  readonly companies: DriverCompanies;
  readonly jobs: ActiveJobs;
  readonly clock: Clock;
}

export const canView = (caller: StaffCaller, companyId: CompanyId): boolean =>
  caller.kind === 'platform' || caller.companyId === companyId;

/** Whoever manages the fleet (or WagonWise) switches the feature on or off for the firm. */
export const canManage = (caller: StaffCaller, companyId: CompanyId): boolean =>
  caller.kind === 'platform' ||
  (caller.companyId === companyId && caller.privileges.includes('manage_fleet'));

// --- the firm's switch ------------------------------------------------------------------------------------------------

export async function getFirmSetting(
  deps: Pick<HoursDeps, 'settings'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<boolean, Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.settings.isEnabled(companyId));
}

/** Turning the feature off removes every status the company holds at once. */
export async function setFirmSetting(
  deps: Pick<HoursDeps, 'settings' | 'statuses' | 'clock'>,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  enabled: boolean,
): Promise<Result<boolean, Forbidden>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  await deps.settings.set(companyId, enabled, staffId, deps.clock.now());
  if (!enabled) await deps.statuses.removeAllForCompany(companyId);
  return ok(enabled);
}

// --- the driver's own choice ------------------------------------------------------------------------------------------

export interface SharingRow {
  readonly companyId: CompanyId;
  readonly companyName: string;
  readonly firmEnabled: boolean;
  readonly sharing: boolean;
}

/** Each company the driver drives for, whether the firm has switched the feature on, and whether the driver shares. */
export async function listMySharing(
  deps: HoursDeps,
  driverId: DriverId,
  identifier: string,
): Promise<SharingRow[]> {
  const companies = await deps.companies.activeCompanies(driverId, identifier);
  const rows: SharingRow[] = [];
  for (const company of companies) {
    rows.push({
      companyId: company.id,
      companyName: company.name,
      firmEnabled: await deps.settings.isEnabled(company.id),
      sharing: await deps.sharing.isSharing(company.id, driverId),
    });
  }
  return rows;
}

/**
 * The driver agrees to share with a company, or stops. Agreeing needs the firm's switch to be on. Stopping always works,
 * and removes the company's view of the driver straight away.
 */
export async function setMySharing(
  deps: HoursDeps,
  driverId: DriverId,
  identifier: string,
  companyId: CompanyId,
  sharing: boolean,
  wordingVersion: number = WORDING_VERSION,
): Promise<Result<boolean, CompanyNotFound | FirmNotEnabled>> {
  const mine = await deps.companies.activeCompanies(driverId, identifier);
  if (!mine.some((c) => c.id === companyId)) {
    // Someone who has left a company can still switch sharing off (and so remove what is left).
    if (!sharing) {
      await deps.sharing.set(companyId, driverId, false, wordingVersion, deps.clock.now());
      await deps.statuses.remove(driverId, companyId);
      return ok(false);
    }
    return err({ tag: 'CompanyNotFound' });
  }
  if (sharing && !(await deps.settings.isEnabled(companyId))) {
    return err({ tag: 'FirmNotEnabled' });
  }
  await deps.sharing.set(companyId, driverId, sharing, wordingVersion, deps.clock.now());
  if (!sharing) await deps.statuses.remove(driverId, companyId);
  return ok(sharing);
}

// --- the status itself -----------------------------------------------------------------------------------------------

/**
 * Stores the driver's latest status, but only when everything lines up: they are on a job for a company, the firm has the
 * feature on, and the driver has chosen to share with that company. Otherwise nothing is stored. The company is the
 * one the driver's job is for, never one the phone names.
 */
export async function reportStatus(
  deps: HoursDeps,
  driverId: DriverId,
  input: {
    readonly state: string;
    readonly drivingLeftMin: number;
    readonly next: string;
    readonly breakMin?: number | undefined;
    readonly stretchMin?: number | undefined;
    readonly untilLimitMin?: number | undefined;
  },
): Promise<Result<void, InvalidStatus | NotOnAJob | NotSharing>> {
  const bad = validateStatus(input);
  if (bad !== undefined) return err(bad);
  const companyId = await deps.jobs.companyOfActiveJob(driverId);
  if (companyId === null) return err({ tag: 'NotOnAJob' });
  if (!(await deps.settings.isEnabled(companyId))) return err({ tag: 'NotSharing' });
  if (!(await deps.sharing.isSharing(companyId, driverId))) return err({ tag: 'NotSharing' });
  await deps.statuses.upsert({
    companyId,
    driverId,
    state: input.state as HoursStatus['state'],
    drivingLeftMin: input.drivingLeftMin,
    next: input.next as HoursStatus['next'],
    breakMin: input.breakMin,
    stretchMin: input.stretchMin,
    untilLimitMin: input.untilLimitMin,
    updatedAt: deps.clock.now(),
  });
  return ok(undefined);
}

/** The driver finished their shift: their status is removed from every company. */
export async function clearMyStatus(
  deps: Pick<HoursDeps, 'statuses'>,
  driverId: DriverId,
): Promise<void> {
  await deps.statuses.remove(driverId);
}

/**
 * The statuses to show the office: the drivers sharing who are on a job for the company now, last updated within the last
 * 12 hours. Nothing at all when the firm has the feature off.
 */
export async function listStatuses(
  deps: HoursDeps,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<HoursStatus[], Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  if (!(await deps.settings.isEnabled(companyId))) return ok([]);
  const now = deps.clock.now();
  const onJobs = new Set(await deps.jobs.driversOnJobs(companyId));
  const all = await deps.statuses.listForCompany(companyId);
  return ok(all.filter((s) => onJobs.has(s.driverId) && isFresh(s, now)));
}

/** Deletes statuses not updated for 12 hours. A platform-wide housekeeping job. */
export async function pruneStale(deps: Pick<HoursDeps, 'statuses' | 'clock'>): Promise<number> {
  return deps.statuses.deleteStale(new Date(deps.clock.now().getTime() - STALE_MS));
}
