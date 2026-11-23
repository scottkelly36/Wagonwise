import { err, ok, type Result } from '../../../shared/result.js';
import type { Job, JobId } from '../domain/job.js';
import type { CompanyPaused } from './errors.js';
import type { CompanyAccounts } from './ports/directories.js';
import type { JobRepository } from './ports/job-repository.js';

export interface PausedGuardDeps {
  readonly repo: Pick<JobRepository, 'findById'>;
  /** Without it nothing is held back (as `startGate`); composition always supplies it. */
  readonly accounts?: CompanyAccounts | undefined;
}

/** `CompanyPaused` when the job's company has a paused account; the job is read in the driver's own scope, so one that is not theirs is
 *  simply not found and the route's own check answers. */
export async function pausedJobCompany(
  deps: PausedGuardDeps,
  jobId: JobId,
): Promise<Result<void, CompanyPaused>> {
  if (deps.accounts === undefined) return ok(undefined);
  const job = await deps.repo.findById(jobId);
  if (job === null) return ok(undefined);
  const name = await deps.accounts.pausedCompanyName(job.companyId);
  return name === null ? ok(undefined) : err({ tag: 'CompanyPaused', companyName: name });
}

/** The name of the company when it is paused, else `null`: for the driver's current job, which then shows as not there. */
export function pausedNameFor(deps: PausedGuardDeps, job: Job): Promise<string | null> {
  return deps.accounts === undefined
    ? Promise.resolve(null)
    : deps.accounts.pausedCompanyName(job.companyId);
}
