import { err, ok, type Result } from '../../../shared/result.js';
import { proofStopFor, type JobId } from '../domain/job.js';
import { canSeeJob, type JobActor } from './authorization.js';
import type { Forbidden, JobNotFound } from './errors.js';
import type { JobRepository, ProofOfDeliveryPhoto } from './ports/job-repository.js';

export interface AttachProofOfDeliveryDeps {
  readonly repo: Pick<JobRepository, 'findById' | 'saveProofOfDelivery'>;
}

export interface AttachProofOfDeliveryInput {
  readonly actor: JobActor;
  readonly jobId: JobId;
  readonly photo: ProofOfDeliveryPhoto;
}

export type AttachProofOfDeliveryError = JobNotFound | Forbidden;

/**
 * A driver attaches a proof-of-delivery photo to the job they're on (P2-M5.5, design doc §5) —
 * always allowed, whether or not the dispatcher marked the job as requiring one;
 * `change-job-status.ts`'s `advanceJobStatus` is what actually enforces the requirement, at the
 * `delivered` step. Only the job's own driver may do this — staff don't capture proof, so unlike
 * `canAdvance`, a staff actor is refused here even for their own company's job.
 */
export async function attachProofOfDelivery(
  deps: AttachProofOfDeliveryDeps,
  input: AttachProofOfDeliveryInput,
): Promise<Result<void, AttachProofOfDeliveryError>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canSeeJob(input.actor, job)) return err({ tag: 'JobNotFound' });
  if (input.actor.kind !== 'driver') return err({ tag: 'Forbidden' });
  // The photo belongs to the delivery the driver is at (or next heading for); a job always has one.
  const stop = proofStopFor(job);
  if (stop === undefined) return err({ tag: 'JobNotFound' });
  await deps.repo.saveProofOfDelivery(job.id, stop, input.photo);
  return ok(undefined);
}
