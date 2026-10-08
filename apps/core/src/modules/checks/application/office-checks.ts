import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId, StaffId } from '../domain/check-template.js';
import type { CheckId } from '../domain/check.js';
import {
  UNFINISHED,
  type CheckDetail,
  type CheckSummary,
  type DefectId,
  type DefectRecord,
  type DefectStatus,
} from '../domain/office.js';
import { ukDay } from '../domain/uk-day.js';
import type { StaffCaller } from './ports/directories.js';
import type { OfficeCheckRepository, StoredCheckPhoto } from './ports/office-check-repository.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** An unknown id, or one of a company the caller cannot see: the same answer, so ids cannot be probed. */
export type NotFound = TaggedError<'NotFound'>;
export type InvalidRange = TaggedError<'InvalidRange'>;

export interface OfficeCheckDeps {
  readonly office: OfficeCheckRepository;
  readonly clock: Clock;
}

/** Fleet managers, dispatchers and anyone who sees reports may read a company's checks; WagonWise staff any. */
function canView(caller: StaffCaller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId &&
      ['manage_fleet', 'dispatch', 'view_reports'].some((p) => caller.privileges.includes(p)))
  );
}

/** Working through defects is for those who run the fleet and the day: fleet managers and dispatchers. */
function canHandle(caller: StaffCaller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId &&
      ['manage_fleet', 'dispatch'].some((p) => caller.privileges.includes(p)))
  );
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day: string, delta: number): string => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};
export const DEFAULT_RESULT_DAYS = 7;
export const MAX_RESULT_DAYS = 400;

/**
 * The checks drivers have done in a range of UK days, newest first. With no range, the last week. A range that runs
 * backwards, or is longer than about a year, is refused.
 */
export async function listCheckResults(
  deps: OfficeCheckDeps,
  caller: StaffCaller,
  companyId: CompanyId,
  range: { readonly from?: string | undefined; readonly to?: string | undefined },
): Promise<Result<CheckSummary[], Forbidden | InvalidRange>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  const today = ukDay(deps.clock.now());
  const to = range.to ?? today;
  const from = range.from ?? addDays(to, -(DEFAULT_RESULT_DAYS - 1));
  if (!DAY.test(from) || !DAY.test(to) || from > to || addDays(from, MAX_RESULT_DAYS) < to) {
    return err({ tag: 'InvalidRange' });
  }
  return ok(await deps.office.listSummaries(companyId, from, to));
}

export async function getCheckResult(
  deps: Pick<OfficeCheckDeps, 'office'>,
  caller: StaffCaller,
  id: CheckId,
): Promise<Result<CheckDetail, Forbidden | NotFound>> {
  const detail = await deps.office.findDetail(id);
  if (detail === null || !canSeeExistence(caller, detail.companyId))
    return err({ tag: 'NotFound' });
  if (!canView(caller, detail.companyId)) return err({ tag: 'Forbidden' });
  return ok(detail);
}

export async function getCheckPhoto(
  deps: Pick<OfficeCheckDeps, 'office'>,
  caller: StaffCaller,
  id: CheckId,
  itemId: string,
): Promise<Result<StoredCheckPhoto, Forbidden | NotFound>> {
  const detail = await deps.office.findDetail(id);
  if (detail === null || !canSeeExistence(caller, detail.companyId))
    return err({ tag: 'NotFound' });
  if (!canView(caller, detail.companyId)) return err({ tag: 'Forbidden' });
  const photo = await deps.office.findPhoto(id, itemId);
  return photo === null ? err({ tag: 'NotFound' }) : ok(photo);
}

/** A company's staff know their own company's records exist, whatever their privileges; others know nothing. */
function canSeeExistence(caller: StaffCaller, companyId: CompanyId): boolean {
  return caller.kind === 'platform' || caller.companyId === companyId;
}

/** The company's defects. With no status, those still to be dealt with (open or acknowledged). */
export async function listCompanyDefects(
  deps: Pick<OfficeCheckDeps, 'office'>,
  caller: StaffCaller,
  companyId: CompanyId,
  status: DefectStatus | undefined,
): Promise<Result<DefectRecord[], Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.office.listDefects(companyId, status === undefined ? UNFINISHED : [status]));
}

/** Moves a defect to open, acknowledged or fixed, noting who and when. */
export async function setDefectStatus(
  deps: OfficeCheckDeps,
  caller: StaffCaller,
  staffId: StaffId,
  id: DefectId,
  status: DefectStatus,
): Promise<Result<DefectRecord, Forbidden | NotFound>> {
  const defect = await deps.office.findDefect(id);
  if (defect === null || !canSeeExistence(caller, defect.companyId)) {
    return err({ tag: 'NotFound' });
  }
  if (!canHandle(caller, defect.companyId)) return err({ tag: 'Forbidden' });
  if (defect.status !== status) {
    await deps.office.setDefectStatus(id, status, staffId, deps.clock.now());
  }
  const updated = await deps.office.findDefect(id);
  return updated === null ? err({ tag: 'NotFound' }) : ok(updated);
}
