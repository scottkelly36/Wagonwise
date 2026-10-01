import type { Job, JobId } from '../../domain/job.js';

export interface JobRepository {
  findById(id: JobId): Promise<Job | null>;
  save(job: Job): Promise<void>;
}
