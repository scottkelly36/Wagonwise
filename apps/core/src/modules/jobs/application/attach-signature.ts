import { err, ok, type Result } from '../../../shared/result.js';
import { proofStopFor, type JobId } from '../domain/job.js';
import { canSeeJob, type JobActor } from './authorization.js';
import type { Forbidden, JobNotFound } from './errors.js';
import type { DeliverySignature, JobRepository } from './ports/job-repository.js';

export interface AttachSignatureDeps {
  readonly repo: Pick<JobRepository, 'findById' | 'saveSignature'>;
}

export interface AttachSignatureInput {
  readonly actor: JobActor;
  readonly jobId: JobId;
  readonly signature: DeliverySignature;
}

export type AttachSignatureError = JobNotFound | Forbidden;

/**
 * A driver takes the receiver's signature for the delivery they are at. Like the photo it is always allowed, whether
 * or not the dispatcher required one; `advanceJobStatus` enforces the requirement at the `delivered` step. Only the
 * job's own driver may take one: staff do not capture proof.
 */
export async function attachSignature(
  deps: AttachSignatureDeps,
  input: AttachSignatureInput,
): Promise<Result<void, AttachSignatureError>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canSeeJob(input.actor, job)) return err({ tag: 'JobNotFound' });
  if (input.actor.kind !== 'driver') return err({ tag: 'Forbidden' });
  const stop = proofStopFor(job);
  if (stop === undefined) return err({ tag: 'JobNotFound' });
  await deps.repo.saveSignature(job.id, stop, input.signature);
  return ok(undefined);
}
