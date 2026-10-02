import type { CompanyId, DriverId, Job } from '../domain/job.js';
import type { Caller } from './ports/caller-directory.js';

/** WagonWise admins create jobs for any company. A company's staff need the `dispatch` privilege
 *  (companies/domain/staff-account.ts's PRIVILEGES) for their own company only. */
export function canDispatch(caller: Caller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId && caller.privileges.includes('dispatch'))
  );
}

/** Staff may look at their own company's jobs without a privilege; WagonWise admins at any. */
export function canViewJobs(caller: Caller, companyId: CompanyId): boolean {
  return caller.kind === 'platform' || caller.companyId === companyId;
}

/** Who is moving a job's status: staff (dispatchers) or the driver the job is assigned to. */
export type JobActor = Caller | { readonly kind: 'driver'; readonly driverId: DriverId };

export function canAdvance(actor: JobActor, job: Job): boolean {
  return actor.kind === 'driver'
    ? job.driverId !== undefined && job.driverId === actor.driverId
    : canDispatch(actor, job.companyId);
}

/** Staff see their own company's jobs; a driver sees only the job assigned to them. */
export function canSeeJob(actor: JobActor, job: Job): boolean {
  return actor.kind === 'driver'
    ? job.driverId !== undefined && job.driverId === actor.driverId
    : canViewJobs(actor, job.companyId);
}
