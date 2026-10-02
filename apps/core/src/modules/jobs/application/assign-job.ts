import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { jobAssignedEvent, jobStatusChangedEvent } from '../domain/events.js';
import {
  assignJobToDriver,
  type DriverId,
  type InvalidTransition,
  type Job,
  type JobId,
  type VehicleId,
} from '../domain/job.js';
import { canDispatch, canViewJobs } from './authorization.js';
import type {
  DriverBusy,
  DriverNotInCompany,
  Forbidden,
  JobNotFound,
  VehicleNotInCompany,
} from './errors.js';
import type { DriverDirectory, VehicleDirectory } from './ports/directories.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobRepository } from './ports/job-repository.js';

export interface AssignJobDeps {
  readonly repo: Pick<JobRepository, 'findById' | 'findActiveForDriver' | 'save'>;
  readonly drivers: DriverDirectory;
  readonly vehicles: VehicleDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface AssignJobInput {
  readonly caller: Caller;
  readonly jobId: JobId;
  readonly driverId: DriverId;
  readonly vehicleId: VehicleId;
}

export type AssignJobError =
  | JobNotFound
  | Forbidden
  | DriverNotInCompany
  | VehicleNotInCompany
  | DriverBusy
  | InvalidTransition;

/** Design doc §5 steps 2-3: dispatch picks a driver and a vehicle from the job's own company and
 *  assigns. The driver must be free (one active job at a time). Raises `JobAssigned`; the push
 *  notification that follows is the driver app's (M5), not wired here. */
export async function assignJob(
  deps: AssignJobDeps,
  input: AssignJobInput,
): Promise<Result<Job, AssignJobError>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canViewJobs(input.caller, job.companyId)) {
    return err({ tag: 'JobNotFound' });
  }
  if (!canDispatch(input.caller, job.companyId)) return err({ tag: 'Forbidden' });

  if (!(await deps.drivers.belongsToCompany(input.driverId, job.companyId))) {
    return err({ tag: 'DriverNotInCompany' });
  }
  if (!(await deps.vehicles.belongsToCompany(input.vehicleId, job.companyId))) {
    return err({ tag: 'VehicleNotInCompany' });
  }
  const busy = await deps.repo.findActiveForDriver(input.driverId);
  if (busy !== null) return err({ tag: 'DriverBusy' });

  const assigned = assignJobToDriver(job, input.driverId, input.vehicleId, deps.clock.now());
  if (!assigned.ok) return assigned;

  await deps.repo.save(assigned.value, [
    jobAssignedEvent(deps.ids.newId(), assigned.value),
    jobStatusChangedEvent(deps.ids.newId(), assigned.value, job.status),
  ]);
  return ok(assigned.value);
}
