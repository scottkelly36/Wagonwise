import type { Job, JobId } from '../../domain/job.js';
import type { JobRepository } from '../ports/job-repository.js';

export class InMemoryJobRepository implements JobRepository {
  #byId = new Map<JobId, Job>();

  findById(id: JobId): Promise<Job | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  save(job: Job): Promise<void> {
    this.#byId.set(job.id, job);
    return Promise.resolve();
  }
}
