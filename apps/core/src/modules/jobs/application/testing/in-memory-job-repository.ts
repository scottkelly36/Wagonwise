import type { DomainEvent } from '../../../../shared/domain-event.js';
import {
  hasProof,
  isActive,
  type CompanyId,
  type DriverId,
  type Job,
  type JobId,
} from '../../domain/job.js';
import type {
  JobRepository,
  ProofOfDeliveryPhoto,
  StoredProofOfDelivery,
} from '../ports/job-repository.js';

export class InMemoryJobRepository implements JobRepository {
  #byId = new Map<JobId, Job>();
  /** Every event saved, in order, for tests to assert on. */
  readonly events: DomainEvent[] = [];
  /** Every photo saved, by job id then delivery stop, for tests to assert on. */
  readonly proofOfDelivery = new Map<JobId, Map<number, StoredProofOfDelivery>>();

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

  saveProofOfDelivery(jobId: JobId, stop: number, photo: ProofOfDeliveryPhoto): Promise<void> {
    const photos = this.proofOfDelivery.get(jobId) ?? new Map<number, StoredProofOfDelivery>();
    photos.set(stop, { ...photo, capturedAt: new Date() });
    this.proofOfDelivery.set(jobId, photos);
    const job = this.#byId.get(jobId);
    if (job) {
      const updated = { ...job, proofStops: [...new Set([...job.proofStops, stop])].sort() };
      this.#byId.set(jobId, { ...updated, hasProofOfDelivery: hasProof(updated) });
    }
    return Promise.resolve();
  }

  deleteProofOfDeliveryOlderThan(companyId: CompanyId, cutoff: Date): Promise<number> {
    let removed = 0;
    for (const [jobId, photos] of this.proofOfDelivery) {
      const job = this.#byId.get(jobId);
      if (job?.companyId !== companyId) continue;
      for (const [stop, photo] of photos) {
        if (photo.capturedAt < cutoff) {
          photos.delete(stop);
          removed += 1;
        }
      }
      if (job) {
        const proofStops = [...photos.keys()].sort();
        const updated = { ...job, proofStops };
        this.#byId.set(jobId, { ...updated, hasProofOfDelivery: hasProof(updated) });
      }
    }
    return Promise.resolve(removed);
  }

  findProofOfDelivery(jobId: JobId, stop?: number): Promise<StoredProofOfDelivery | null> {
    const photos = this.proofOfDelivery.get(jobId);
    if (photos === undefined) return Promise.resolve(null);
    if (stop !== undefined) return Promise.resolve(photos.get(stop) ?? null);
    const latest = Math.max(...photos.keys());
    return Promise.resolve(photos.get(latest) ?? null);
  }
}
