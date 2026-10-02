import type { DomainEvent } from '../../../../shared/domain-event.js';
import type { CompanyId, DriverId, Job, JobId } from '../../domain/job.js';

export interface JobRepository {
  findById(id: JobId): Promise<Job | null>;
  /** The job a driver is currently on, if any (assigned up to at_delivery). */
  findActiveForDriver(driverId: DriverId): Promise<Job | null>;
  /** Newest first. */
  listForCompany(companyId: CompanyId): Promise<Job[]>;
  /** `events` are written to the outbox together with the job. */
  save(job: Job, events?: readonly DomainEvent[]): Promise<void>;
}
