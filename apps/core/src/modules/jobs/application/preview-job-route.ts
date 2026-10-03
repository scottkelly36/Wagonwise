import { err, ok, type Result } from '../../../shared/result.js';
import type { JobId, VehicleId } from '../domain/job.js';
import { canDispatch, canViewJobs } from './authorization.js';
import type { Forbidden, JobNotFound, NoRouteForVehicle, VehicleNotInCompany } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { VehicleDirectory } from './ports/directories.js';
import type { JobRepository } from './ports/job-repository.js';
import type { JobRouteEstimator } from './ports/route-estimator.js';

export interface PreviewJobRouteDeps {
  readonly repo: Pick<JobRepository, 'findById'>;
  readonly vehicles: VehicleDirectory;
  readonly routes: JobRouteEstimator;
}

export interface JobRouteLeg {
  readonly fromName: string;
  readonly toName: string;
  readonly distanceKm: number;
  readonly durationMin: number;
}

export interface JobRoutePreview {
  readonly legs: readonly JobRouteLeg[];
  readonly distanceKm: number;
  readonly durationMin: number;
}

export type PreviewJobRouteError =
  JobNotFound | Forbidden | VehicleNotInCompany | NoRouteForVehicle;

/**
 * Design doc §5 step 2: before assigning, dispatch sees how far and how long the job is for the
 * vehicle they are about to pick, and learns early if that vehicle cannot do it at all (too tall,
 * wide or heavy for every road between the stops). The stops are routed in order, one estimate per
 * leg, and summed. Same estimator as the live ETA (`listJobEtas`), so the same caveats: unpersisted,
 * hazard-agnostic, a guide and not a plan.
 *
 * Needs the `dispatch` privilege, like assigning itself — it is part of that decision. Uses the
 * company's own vehicle directory so a vehicle from another company is refused here too, not
 * quietly routed.
 */
export async function previewJobRoute(
  deps: PreviewJobRouteDeps,
  input: {
    readonly caller: Caller;
    readonly jobId: JobId;
    readonly vehicleId: VehicleId;
  },
): Promise<Result<JobRoutePreview, PreviewJobRouteError>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canViewJobs(input.caller, job.companyId)) {
    return err({ tag: 'JobNotFound' });
  }
  if (!canDispatch(input.caller, job.companyId)) return err({ tag: 'Forbidden' });
  if (!(await deps.vehicles.belongsToCompany(input.vehicleId, job.companyId))) {
    return err({ tag: 'VehicleNotInCompany' });
  }

  const legs: JobRouteLeg[] = [];
  for (const [index, to] of job.stops.entries()) {
    const from = job.stops[index - 1];
    if (from === undefined) continue;
    const estimate = await deps.routes.estimate({
      vehicleId: input.vehicleId,
      from: from.location,
      to: to.location,
    });
    if (!estimate.ok) return err({ tag: 'NoRouteForVehicle' });
    legs.push({
      fromName: from.name,
      toName: to.name,
      distanceKm: estimate.value.distanceKm,
      durationMin: estimate.value.durationMin,
    });
  }
  return ok({
    legs,
    distanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    durationMin: legs.reduce((sum, leg) => sum + leg.durationMin, 0),
  });
}
