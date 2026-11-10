import { err, ok, type Result } from '../../../shared/result.js';
import type { JobId } from '../domain/job.js';
import { canViewJobs } from './authorization.js';
import type { JobNotFound, SignatureNotFound } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobRepository, StoredDeliverySignature } from './ports/job-repository.js';

export interface GetSignatureDeps {
  readonly repo: Pick<JobRepository, 'findById' | 'findSignature'>;
}

export type GetSignatureError = JobNotFound | SignatureNotFound;

/** The signature a driver took, for a dispatcher to look at. Visible to anyone who can see the company's jobs; a job in
 *  another company is "not found", exactly like the photo, so ids cannot be probed. */
export async function getSignature(
  deps: GetSignatureDeps,
  input: { readonly caller: Caller; readonly jobId: JobId; readonly stop?: number | undefined },
): Promise<Result<StoredDeliverySignature, GetSignatureError>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canViewJobs(input.caller, job.companyId)) {
    return err({ tag: 'JobNotFound' });
  }
  const signature = await deps.repo.findSignature(job.id, input.stop);
  return signature === null ? err({ tag: 'SignatureNotFound' }) : ok(signature);
}
