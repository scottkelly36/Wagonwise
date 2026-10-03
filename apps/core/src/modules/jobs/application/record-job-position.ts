import { err, ok, type Result } from '../../../shared/result.js';
import type { Clock } from '../../../shared/ports/clock.js';
import { isTracked, type JobId } from '../domain/job.js';
import { canSeeJob, type JobActor } from './authorization.js';
import type { Forbidden, JobNotFound, NotTracking } from './errors.js';
import type { JobPositionRepository } from './ports/job-position-repository.js';
import type { JobRepository } from './ports/job-repository.js';

export interface RecordJobPositionDeps {
  readonly repo: Pick<JobRepository, 'findById'>;
  readonly positions: Pick<JobPositionRepository, 'record'>;
  readonly clock: Clock;
}

export type RecordJobPositionError = JobNotFound | Forbidden | NotTracking;

/**
 * The driver app reports where it is while the driver is out on a job (P2-M6.1). Only the job's
 * own driver may, and only while the job is being driven (`isTracked`) — a position for anything
 * else is refused and nothing is stored, which is how "location only during active work"
 * (AGENTS.md) is enforced on the server rather than trusted to the app. Stamped with the server's
 * clock, not the phone's, so a wrong phone clock can't put a point in the wrong place in time.
 */
export async function recordJobPosition(
  deps: RecordJobPositionDeps,
  input: {
    readonly actor: JobActor;
    readonly jobId: JobId;
    readonly location: { readonly lat: number; readonly lon: number };
  },
): Promise<Result<void, RecordJobPositionError>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canSeeJob(input.actor, job)) return err({ tag: 'JobNotFound' });
  if (input.actor.kind !== 'driver') return err({ tag: 'Forbidden' });
  if (!isTracked(job.status)) return err({ tag: 'NotTracking' });
  await deps.positions.record({
    jobId: job.id,
    location: input.location,
    recordedAt: deps.clock.now(),
  });
  return ok(undefined);
}
