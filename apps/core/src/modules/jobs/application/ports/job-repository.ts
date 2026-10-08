import type { DomainEvent } from '../../../../shared/domain-event.js';
import type { CompanyId, DriverId, Job, JobId, VehicleId } from '../../domain/job.js';

/** A proof-of-delivery photo as the driver's upload produced it (P2-M5.5) — stored as-is, in
 *  `jobs.proof_of_delivery`, not an S3-style object store yet (deferred until there's real
 *  volume or a dashboard viewer to justify it). */
export interface ProofOfDeliveryPhoto {
  readonly contentType: string;
  readonly data: Buffer;
}

/** A stored photo as read back, with when the driver took it. */
export interface StoredProofOfDelivery extends ProofOfDeliveryPhoto {
  readonly capturedAt: Date;
}

export interface JobRepository {
  findById(id: JobId): Promise<Job | null>;
  /** The job a driver is currently on, if any (assigned up to at_delivery). */
  findActiveForDriver(driverId: DriverId): Promise<Job | null>;
  /** The job a vehicle is currently on, if any (assigned up to at_delivery). */
  findActiveForVehicle(vehicleId: VehicleId): Promise<Job | null>;
  /** Newest first. */
  listForCompany(companyId: CompanyId): Promise<Job[]>;
  /** `events` are written to the outbox together with the job. */
  save(job: Job, events?: readonly DomainEvent[]): Promise<void>;
  /** Replaces any existing photo for this delivery stop (by position) — retaking replaces, not appends. */
  saveProofOfDelivery(jobId: JobId, stop: number, photo: ProofOfDeliveryPhoto): Promise<void>;
  /** The photo for a delivery stop, or the latest one when no stop is given; `null` if none was attached.
   *  Never loaded by the plain job reads. */
  findProofOfDelivery(jobId: JobId, stop?: number): Promise<StoredProofOfDelivery | null>;
  /** Deletes a company's proof photos taken before `cutoff`; returns how many went. */
  deleteProofOfDeliveryOlderThan(companyId: CompanyId, cutoff: Date): Promise<number>;
}
