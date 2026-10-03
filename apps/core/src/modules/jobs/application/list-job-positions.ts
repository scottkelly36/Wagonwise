import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId } from '../domain/job.js';
import { canViewJobs } from './authorization.js';
import type { Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobPosition, JobPositionRepository } from './ports/job-position-repository.js';

export interface ListJobPositionsDeps {
  readonly positions: Pick<JobPositionRepository, 'latestForCompany'>;
}

/** Where each of a company's jobs on the road was last seen, for the live map (P2-M6). Anyone who
 *  can see the company's jobs can see this — no privilege, same as the job list. */
export async function listJobPositions(
  deps: ListJobPositionsDeps,
  input: { readonly caller: Caller; readonly companyId: CompanyId },
): Promise<Result<JobPosition[], Forbidden>> {
  if (!canViewJobs(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.positions.latestForCompany(input.companyId));
}
