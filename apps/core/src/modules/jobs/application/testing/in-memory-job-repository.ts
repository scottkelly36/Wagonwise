import type { DomainEvent } from '../../../../shared/domain-event.js';
import {
  hasProof,
  hasSignatureFor,
  isActive,
  type CompanyId,
  type DriverId,
  type Job,
  type JobId,
  type VehicleId,
} from '../../domain/job.js';
import type {
  DeliverySignature,
  JobRepository,
  ProofOfDeliveryPhoto,
  StoredDeliverySignature,
  StoredProofOfDelivery,
} from '../ports/job-repository.js';

export class InMemoryJobRepository implements JobRepository {
  #byId = new Map<JobId, Job>();
  /** Every event saved, in order, for tests to assert on. */
  readonly events: DomainEvent[] = [];
  /** Every photo saved, by job id then delivery stop, for tests to assert on. */
  readonly proofOfDelivery = new Map<JobId, Map<number, StoredProofOfDelivery>>();

  /** Every signature saved, by job id then delivery stop, for tests to assert on. */
  readonly signatures = new Map<JobId, Map<number, StoredDeliverySignature>>();

  findById(id: JobId): Promise<Job | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  findActiveForVehicle(vehicleId: VehicleId): Promise<Job | null> {
    const found = [...this.#byId.values()].find(
      (j) => j.vehicleId === vehicleId && isActive(j.status),
    );
    return Promise.resolve(found ?? null);
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

  saveSignature(jobId: JobId, stop: number, signature: DeliverySignature): Promise<void> {
    const taken = this.signatures.get(jobId) ?? new Map<number, StoredDeliverySignature>();
    taken.set(stop, { ...signature, capturedAt: new Date() });
    this.signatures.set(jobId, taken);
    this.#refreshSignatures(jobId);
    return Promise.resolve();
  }

  findSignature(jobId: JobId, stop?: number): Promise<StoredDeliverySignature | null> {
    const taken = this.signatures.get(jobId);
    if (taken === undefined || taken.size === 0) return Promise.resolve(null);
    if (stop !== undefined) return Promise.resolve(taken.get(stop) ?? null);
    return Promise.resolve(taken.get(Math.max(...taken.keys())) ?? null);
  }

  deleteSignaturesOlderThan(companyId: CompanyId, cutoff: Date): Promise<number> {
    let removed = 0;
    for (const [jobId, taken] of this.signatures) {
      if (this.#byId.get(jobId)?.companyId !== companyId) continue;
      for (const [stop, signature] of taken) {
        if (signature.capturedAt < cutoff) {
          taken.delete(stop);
          removed += 1;
        }
      }
      this.#refreshSignatures(jobId);
    }
    return Promise.resolve(removed);
  }

  #refreshSignatures(jobId: JobId): void {
    const job = this.#byId.get(jobId);
    if (job === undefined) return;
    const signatureStops = [...(this.signatures.get(jobId)?.keys() ?? [])].sort();
    const updated = { ...job, signatureStops };
    this.#byId.set(jobId, { ...updated, hasSignature: hasSignatureFor(updated) });
  }

  findProofOfDelivery(jobId: JobId, stop?: number): Promise<StoredProofOfDelivery | null> {
    const photos = this.proofOfDelivery.get(jobId);
    if (photos === undefined) return Promise.resolve(null);
    if (stop !== undefined) return Promise.resolve(photos.get(stop) ?? null);
    const latest = Math.max(...photos.keys());
    return Promise.resolve(photos.get(latest) ?? null);
  }
}
