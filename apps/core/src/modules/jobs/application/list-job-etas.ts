import { err, ok, type Result } from '../../../shared/result.js';
import { isTracked, nextStopFor, type CompanyId, type JobId, type JobStop } from '../domain/job.js';
import { canViewJobs } from './authorization.js';
import type { Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobPositionRepository } from './ports/job-position-repository.js';
import type { JobRepository } from './ports/job-repository.js';
import type { JobRouteEstimator, RouteEstimate } from './ports/route-estimator.js';

export interface ListJobEtasDeps {
  readonly repo: Pick<JobRepository, 'listForCompany'>;
  readonly positions: Pick<JobPositionRepository, 'latestForCompany'>;
  readonly routes: JobRouteEstimator;
}

/** Where a vehicle is heading and how long it should take to get there, from where it was last
 *  heard. `fromRecordedAt` says how old that starting point is. */
export interface JobEta extends RouteEstimate {
  readonly jobId: JobId;
  readonly stopKind: JobStop['kind'];
  readonly fromRecordedAt: Date;
}

/**
 * ETAs for the company's jobs that are on the road (P2-M6.4, design doc §6), for the dispatcher's
 * live map. A job gets one only if it has a vehicle, a heard-from position and a next stop, and a
 * route exists; any other job is simply absent, and so is one whose estimate fails — the map
 * and the position list work without ETAs, so a routing engine being down degrades it rather than
 * breaking it.
 *
 * Time is measured from the last position, not from now: for a vehicle last heard from ten minutes
 * ago the dashboard shows that, via `fromRecordedAt`, instead of presenting stale numbers as live.
 */
export async function listJobEtas(
  deps: ListJobEtasDeps,
  input: { readonly caller: Caller; readonly companyId: CompanyId },
): Promise<Result<JobEta[], Forbidden>> {
  if (!canViewJobs(input.caller, input.companyId)) return err({ tag: 'Forbidden' });

  const [jobs, positions] = await Promise.all([
    deps.repo.listForCompany(input.companyId),
    deps.positions.latestForCompany(input.companyId),
  ]);
  const positionByJob = new Map(positions.map((p) => [p.jobId, p]));

  const etas = await Promise.all(
    jobs.map(async (job): Promise<JobEta | undefined> => {
      const position = positionByJob.get(job.id);
      const stop = nextStopFor(job);
      if (!isTracked(job.status) || job.vehicleId === undefined) return undefined;
      if (position === undefined || stop === undefined) return undefined;
      try {
        const estimate = await deps.routes.estimate({
          vehicleId: job.vehicleId,
          from: position.location,
          to: stop.location,
        });
        if (!estimate.ok) return undefined;
        return {
          ...estimate.value,
          jobId: job.id,
          stopKind: stop.kind,
          fromRecordedAt: position.recordedAt,
        };
      } catch {
        return undefined;
      }
    }),
  );
  return ok(etas.filter((eta): eta is JobEta => eta !== undefined));
}
