import { isTracked, type CompanyId } from '../../domain/job.js';
import type { JobPosition, JobPositionRepository } from '../ports/job-position-repository.js';
import type { InMemoryJobRepository } from './in-memory-job-repository.js';

/** Mirrors the Postgres query's rules over an `InMemoryJobRepository`: the newest report per job,
 *  only for the company's jobs that are being driven right now. */
export class InMemoryJobPositionRepository implements JobPositionRepository {
  /** Every position recorded, in order, for tests to assert on. */
  readonly recorded: JobPosition[] = [];

  constructor(private readonly jobs: InMemoryJobRepository) {}

  record(position: JobPosition): Promise<void> {
    this.recorded.push(position);
    return Promise.resolve();
  }

  deleteOlderThan(cutoff: Date): Promise<number> {
    const keep = this.recorded.filter((p) => p.recordedAt >= cutoff);
    const removed = this.recorded.length - keep.length;
    this.recorded.splice(0, this.recorded.length, ...keep);
    return Promise.resolve(removed);
  }

  async latestForCompany(companyId: CompanyId): Promise<JobPosition[]> {
    const latest = new Map<string, JobPosition>();
    for (const position of this.recorded) {
      const seen = latest.get(position.jobId);
      if (seen === undefined || seen.recordedAt <= position.recordedAt) {
        latest.set(position.jobId, position);
      }
    }
    const result: JobPosition[] = [];
    for (const position of latest.values()) {
      const job = await this.jobs.findById(position.jobId);
      if (job !== null && job.companyId === companyId && isTracked(job.status)) {
        result.push(position);
      }
    }
    return result;
  }
}
