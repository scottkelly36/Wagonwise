import { err, type Result } from '../../../shared/result.js';
import { isTracked, type JobId } from '../domain/job.js';
import { canSeeJob, type JobActor } from './authorization.js';
import type { Forbidden, JobNotFound, NoVehicleAssigned, NotTracking } from './errors.js';
import type {
  NavigationProfileProvisioner,
  VehicleUnavailable,
} from './ports/navigation-profile.js';
import type { JobRepository } from './ports/job-repository.js';

export interface GetNavigationProfileDeps {
  readonly repo: Pick<JobRepository, 'findById'>;
  readonly profiles: NavigationProfileProvisioner;
}

export type GetNavigationProfileError =
  JobNotFound | Forbidden | NotTracking | NoVehicleAssigned | VehicleUnavailable;

/**
 * The routing profile for navigating a job (the driver app's "Start"). It is built from the company
 * vehicle the dispatcher assigned, never from a profile the driver picked, because a wrong height or
 * weight is what puts a lorry under a low bridge. Only the job's own driver may ask, and only once the
 * job is being driven; a job with no vehicle is refused rather than guessed at.
 */
export async function getNavigationProfile(
  deps: GetNavigationProfileDeps,
  input: { readonly actor: JobActor; readonly jobId: JobId },
): Promise<Result<{ profileId: string; vehicleName: string }, GetNavigationProfileError>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canSeeJob(input.actor, job)) return err({ tag: 'JobNotFound' });
  if (input.actor.kind !== 'driver') return err({ tag: 'Forbidden' });
  if (!isTracked(job.status)) return err({ tag: 'NotTracking' });
  if (job.vehicleId === undefined) return err({ tag: 'NoVehicleAssigned' });
  return deps.profiles.provision({ driverId: input.actor.driverId, vehicleId: job.vehicleId });
}
