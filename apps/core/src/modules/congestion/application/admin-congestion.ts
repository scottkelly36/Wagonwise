import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  isExpired,
  type CongestionReport,
  type CongestionReportId,
} from '../domain/congestion-report.js';
import type { CongestionRepository } from './ports/congestion-repository.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type CongestionNotFound = TaggedError<'CongestionNotFound'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

export interface AdminCongestionDeps {
  readonly repo: CongestionRepository;
  readonly clock: Clock;
}

/** The most reports one answer carries. */
export const ADMIN_LIST_LIMIT = 1000;

export interface ReviewedReport {
  readonly report: CongestionReport;
  /** True while its time has not run out. */
  readonly active: boolean;
}

/** Every congestion report, newest first, with whether it still counts. WagonWise staff only. */
export async function listCongestion(
  deps: AdminCongestionDeps,
  caller: StaffCaller,
): Promise<Result<{ reports: ReviewedReport[]; total: number; active: number }, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const now = deps.clock.now();
  const [reports, counts] = await Promise.all([
    deps.repo.findAll(ADMIN_LIST_LIMIT),
    deps.repo.counts(now),
  ]);
  return ok({
    reports: reports.map((report) => ({ report, active: !isExpired(report, now) })),
    total: counts.total,
    active: counts.active,
  });
}

/** Removes one report, for example a test or a wrong one. WagonWise staff only. */
export async function deleteCongestion(
  deps: Pick<AdminCongestionDeps, 'repo'>,
  caller: StaffCaller,
  id: CongestionReportId,
): Promise<Result<void, Forbidden | CongestionNotFound>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return (await deps.repo.deleteById(id)) ? ok(undefined) : err({ tag: 'CongestionNotFound' });
}

/** Removes every report whose time has run out (they no longer show to drivers; this just tidies the list). WagonWise staff only. */
export async function clearExpiredCongestion(
  deps: AdminCongestionDeps,
  caller: StaffCaller,
): Promise<Result<number, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return ok(await deps.repo.deleteExpired(deps.clock.now()));
}
