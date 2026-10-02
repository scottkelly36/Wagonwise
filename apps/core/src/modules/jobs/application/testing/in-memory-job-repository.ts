import type { DomainEvent } from '../../../../shared/domain-event.js';
import { isActive, type CompanyId, type DriverId, type Job, type JobId } from '../../domain/job.js';
import type { JobRepository, ProofOfDeliveryPhoto } from '../ports/job-repository.js';

export class InMemoryJobRepository implements JobRepository {
  #byId = new Map<JobId, Job>();
  /** Every event saved, in order, for tests to assert on. */
  readonly events: DomainEvent[] = [];
  /** Every photo saved, by job id, for tests to assert on. */
  readonly proofOfDelivery = new Map<JobId, ProofOfDeliveryPhoto>();

  findById(id: JobId): Promise<Job | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  findActiveForDriver(driverId: DriverId): Promise<Job | null> {
    const found = [...this.#byId.values()].find(
      (j) => j.driverId === driverId && isActive(j.status),
    );
    return Promise.resolve(found ?? null);
  }

  listForCompany(companyId: CompanyId): Promise<Job[]> {
    return Promise.resolve([...this.#byId.values()].filter((j) => j.companyId === companyId));
  }

  save(job: Job, events: readonly DomainEvent[] = []): Promise<void> {
    this.#byId.set(job.id, job);
    this.events.push(...events);
    return Promise.resolve();
  }

  saveProofOfDelivery(jobId: JobId, photo: ProofOfDeliveryPhoto): Promise<void> {
    this.proofOfDelivery.set(jobId, photo);
    const job = this.#byId.get(jobId);
    if (job) this.#byId.set(jobId, { ...job, hasProofOfDelivery: true });
    return Promise.resolve();
  }
}
