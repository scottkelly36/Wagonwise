import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId, DriverId, Job, JobId } from '../domain/job.js';
import { canViewJobs } from './authorization.js';
import type { Forbidden, JobNotFound } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobRepository } from './ports/job-repository.js';

export interface ListJobsDeps {
  readonly repo: Pick<JobRepository, 'listForCompany'>;
  readonly clock: Clock;
}

/** How far back the list goes unless asked for more. Jobs still open are always in. */
export const DEFAULT_JOB_WINDOW_DAYS = 90;
/** The most jobs one list returns, newest kept: a safety rail, well above what a small firm creates in the window. */
export const JOB_LIST_LIMIT = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A company's jobs, newest first: every job still open, and any finished one created in the last `days`
 * (default 90). `days: 'all'` lifts the window. Without one a busy firm's whole history came down with every
 * dashboard refresh. `since` says where the window starts, or is absent when nothing was left out by date.
 */
export async function listJobs(
  deps: ListJobsDeps,
  input: {
    readonly caller: Caller;
    readonly companyId: CompanyId;
    readonly days?: number | 'all';
  },
): Promise<Result<{ jobs: Job[]; since?: Date }, Forbidden>> {
  if (!canViewJobs(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  const days = input.days ?? DEFAULT_JOB_WINDOW_DAYS;
  const since = days === 'all' ? undefined : new Date(deps.clock.now().getTime() - days * DAY_MS);
  const jobs = await deps.repo.listForCompany(input.companyId, {
    ...(since === undefined ? {} : { since }),
    limit: JOB_LIST_LIMIT,
  });
  return ok(since === undefined ? { jobs } : { jobs, since });
}

export interface GetJobDeps {
  readonly repo: Pick<JobRepository, 'findById'>;
}

/** One job; one in a company the caller can't see is "not found", same as an unknown id. */
export async function getJob(
  deps: GetJobDeps,
  input: { readonly caller: Caller; readonly jobId: JobId },
): Promise<Result<Job, JobNotFound>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canViewJobs(input.caller, job.companyId)) {
    return err({ tag: 'JobNotFound' });
  }
  return ok(job);
}

export interface CurrentJobDeps {
  readonly repo: Pick<JobRepository, 'findActiveForDriver'>;
}

/** The one job a driver is on right now, or `null` (P2-M5.1's Jobs tab). The query is already
 *  scoped to `driverId`, and the `driver` data scope's RLS predicate (migration 0030) backs that
 *  up, so there's no caller check to make here, unlike `getJob`/`listJobs`. */
export function getCurrentJob(
  deps: CurrentJobDeps,
  input: { readonly driverId: DriverId },
): Promise<Job | null> {
  return deps.repo.findActiveForDriver(input.driverId);
}
