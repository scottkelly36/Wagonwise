import type { CompanyId, JobId } from '../../domain/job.js';

export interface JobPosition {
  readonly jobId: JobId;
  readonly location: { readonly lat: number; readonly lon: number };
  readonly recordedAt: Date;
}

export interface JobPositionRepository {
  record(position: JobPosition): Promise<void>;
  /** The most recent position of each of the company's jobs that is being driven right now
   *  (`isTracked`), newest report per job. Jobs with no report yet are simply absent. */
  latestForCompany(companyId: CompanyId): Promise<JobPosition[]>;
  /** Deletes every position recorded before `cutoff`, for every company, and says how many went. */
  deleteOlderThan(cutoff: Date): Promise<number>;
}
