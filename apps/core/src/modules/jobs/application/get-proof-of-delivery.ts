import { err, ok, type Result } from '../../../shared/result.js';
import type { JobId } from '../domain/job.js';
import { canViewJobs } from './authorization.js';
import type { JobNotFound, ProofOfDeliveryNotFound } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobRepository, StoredProofOfDelivery } from './ports/job-repository.js';

export interface GetProofOfDeliveryDeps {
  readonly repo: Pick<JobRepository, 'findById' | 'findProofOfDelivery'>;
}

export type GetProofOfDeliveryError = JobNotFound | ProofOfDeliveryNotFound;

/**
 * The delivery photo a driver attached, for a dispatcher to look at (P2-M5 follow-up). Anyone who
 * can see the company's jobs can see its photos — no privilege, same as the job list itself —
 * and a job in another company is "not found", exactly like `getJob`, so ids can't be probed.
 * Photos are read one at a time, on request, never alongside the job: they are megabytes each.
 */
export async function getProofOfDelivery(
  deps: GetProofOfDeliveryDeps,
  input: { readonly caller: Caller; readonly jobId: JobId; readonly stop?: number | undefined },
): Promise<Result<StoredProofOfDelivery, GetProofOfDeliveryError>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canViewJobs(input.caller, job.companyId)) {
    return err({ tag: 'JobNotFound' });
  }
  const photo = await deps.repo.findProofOfDelivery(job.id, input.stop);
  return photo === null ? err({ tag: 'ProofOfDeliveryNotFound' }) : ok(photo);
}
