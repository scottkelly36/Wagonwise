import type { DomainEvent } from '../../../shared/domain-event.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { jobCancelledEvent, jobCompletedEvent, jobStatusChangedEvent } from '../domain/events.js';
import {
  advanceStatus,
  cancelJob as cancelJobDomain,
  failJob as failJobDomain,
  type GeoPoint,
  type InvalidTransition,
  type Job,
  type JobId,
  type JobStatus,
} from '../domain/job.js';
import { canAdvance, canSeeJob, type JobActor } from './authorization.js';
import type {
  CheckRequired,
  Forbidden,
  JobNotFound,
  ProofOfDeliveryRequired,
  VehicleNotFit,
} from './errors.js';
import type { JobStartGate } from './ports/directories.js';
import type { JobRepository } from './ports/job-repository.js';

export interface ChangeJobStatusDeps {
  readonly repo: Pick<JobRepository, 'findById' | 'save'>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** The walk-round check gate on a driver accepting a job. Only the driver's door supplies it: a dispatcher acting for
   *  a driver is never held up by it. Without it there is no gate. */
  readonly startGate?: JobStartGate | undefined;
}

export type ChangeJobStatusError = JobNotFound | Forbidden | InvalidTransition;

/** The job, if this actor may see it and act on it; the error to send back otherwise. A job the
 *  actor can't see is "not found", same as an unknown id, so ids can't be probed. */
async function loadForAction(
  deps: ChangeJobStatusDeps,
  actor: JobActor,
  jobId: JobId,
): Promise<Result<Job, JobNotFound | Forbidden>> {
  const job = await deps.repo.findById(jobId);
  if (job === null || !canSeeJob(actor, job)) return err({ tag: 'JobNotFound' });
  if (!canAdvance(actor, job)) return err({ tag: 'Forbidden' });
  return ok(job);
}

async function commit(
  deps: ChangeJobStatusDeps,
  before: Job,
  after: Job,
): Promise<Result<Job, never>> {
  const events: DomainEvent[] = [jobStatusChangedEvent(deps.ids.newId(), after, before.status)];
  if (after.status === 'delivered') events.push(jobCompletedEvent(deps.ids.newId(), after));
  if (after.status === 'cancelled') events.push(jobCancelledEvent(deps.ids.newId(), after));
  await deps.repo.save(after, events);
  return ok(after);
}

export interface AdvanceJobStatusInput {
  readonly actor: JobActor;
  readonly jobId: JobId;
  readonly to: JobStatus;
  readonly position?: GeoPoint | undefined;
}

/** Moves a job one step forward (accepted, at pickup, loaded, ...). The driver on the job or a
 *  dispatcher may do it; never a skip or a step back (domain `advanceStatus`). Reaching
 *  `delivered` on a job the dispatcher flagged as needing proof refuses without one
 *  (P2-M5.5) — attaching the photo itself is a separate route
 *  (`attach-proof-of-delivery.ts`), not part of this call. */
export async function advanceJobStatus(
  deps: ChangeJobStatusDeps,
  input: AdvanceJobStatusInput,
): Promise<
  Result<Job, ChangeJobStatusError | ProofOfDeliveryRequired | CheckRequired | VehicleNotFit>
> {
  const loaded = await loadForAction(deps, input.actor, input.jobId);
  if (!loaded.ok) return loaded;
  // A driver accepting an assigned job: the company may want the vehicle's walk-round check done first, and a vehicle
  // with a "do not drive" defect held back. A dispatcher moving the job is not held up.
  if (
    deps.startGate !== undefined &&
    input.actor.kind === 'driver' &&
    input.to === 'accepted' &&
    loaded.value.status === 'assigned' &&
    loaded.value.vehicleId !== undefined
  ) {
    const verdict = await deps.startGate.check(loaded.value.companyId, loaded.value.vehicleId);
    if (verdict === 'check_required') return err({ tag: 'CheckRequired' });
    if (verdict === 'vehicle_not_fit') return err({ tag: 'VehicleNotFit' });
  }
  // Finishing a delivery stop (the last one, or one of several) needs its photo when the job requires proof.
  if (
    loaded.value.status === 'at_delivery' &&
    loaded.value.requiresProofOfDelivery &&
    !loaded.value.hasProofOfDelivery
  ) {
    return err({ tag: 'ProofOfDeliveryRequired' });
  }
  const next = advanceStatus(loaded.value, input.to, deps.clock.now(), input.position);
  if (!next.ok) return next;
  return commit(deps, loaded.value, next.value);
}

export interface CancelOrFailInput {
  readonly actor: JobActor;
  readonly jobId: JobId;
  readonly position?: GeoPoint | undefined;
}

/** A dispatcher cancels any unfinished job. */
export async function cancelJob(
  deps: ChangeJobStatusDeps,
  input: CancelOrFailInput,
): Promise<Result<Job, ChangeJobStatusError>> {
  const loaded = await loadForAction(deps, input.actor, input.jobId);
  if (!loaded.ok) return loaded;
  if (input.actor.kind === 'driver') return err({ tag: 'Forbidden' });
  const next = cancelJobDomain(loaded.value, deps.clock.now());
  if (!next.ok) return next;
  return commit(deps, loaded.value, next.value);
}

/** Marks a job that's with a driver as failed (a breakdown, a refused load). */
export async function failJob(
  deps: ChangeJobStatusDeps,
  input: CancelOrFailInput,
): Promise<Result<Job, ChangeJobStatusError>> {
  const loaded = await loadForAction(deps, input.actor, input.jobId);
  if (!loaded.ok) return loaded;
  const next = failJobDomain(loaded.value, deps.clock.now(), input.position);
  if (!next.ok) return next;
  return commit(deps, loaded.value, next.value);
}
