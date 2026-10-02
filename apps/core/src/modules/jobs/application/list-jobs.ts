import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId, DriverId, Job, JobId } from '../domain/job.js';
import { canViewJobs } from './authorization.js';
import type { Forbidden, JobNotFound } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobRepository } from './ports/job-repository.js';

export interface ListJobsDeps {
  readonly repo: Pick<JobRepository, 'listForCompany'>;
}

/** A company's jobs, newest first. */
export async function listJobs(
  deps: ListJobsDeps,
  input: { readonly caller: Caller; readonly companyId: CompanyId },
): Promise<Result<Job[], Forbidden>> {
  if (!canViewJobs(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.repo.listForCompany(input.companyId));
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
