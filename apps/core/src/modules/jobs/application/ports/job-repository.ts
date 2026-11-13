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

/** A receiver's signature as the driver's app drew it: the strokes, and the name they gave if any. */
export interface DeliverySignature {
  readonly strokes: readonly (readonly (readonly [number, number])[])[];
  readonly signerName?: string | undefined;
}

/** A stored signature as read back, with when it was taken. */
export interface StoredDeliverySignature extends DeliverySignature {
  readonly capturedAt: Date;
}

export interface JobRepository {
  findById(id: JobId): Promise<Job | null>;
  /** The job a driver is currently on, if any (assigned up to at_delivery). */
  findActiveForDriver(driverId: DriverId): Promise<Job | null>;
  /** The job a vehicle is currently on, if any (assigned up to at_delivery). */
  findActiveForVehicle(vehicleId: VehicleId): Promise<Job | null>;
  /** Newest first. With `since`, a finished job (delivered, cancelled, failed) is left out unless it was
   *  created on or after that time; a job still open is always in. `limit` caps the count, newest kept. */
  listForCompany(
    companyId: CompanyId,
    options?: { readonly since?: Date; readonly limit?: number },
  ): Promise<Job[]>;
  /** Every job not yet finished (draft up to at_delivery), newest first. For callers that only care about work in
   *  progress, so a firm's whole history is not loaded each time. */
  listOpenForCompany(companyId: CompanyId): Promise<Job[]>;
  /** `events` are written to the outbox together with the job. */
  save(job: Job, events?: readonly DomainEvent[]): Promise<void>;
  /** Replaces any existing photo for this delivery stop (by position) — retaking replaces, not appends. */
  saveProofOfDelivery(jobId: JobId, stop: number, photo: ProofOfDeliveryPhoto): Promise<void>;
  /** The photo for a delivery stop, or the latest one when no stop is given; `null` if none was attached.
   *  Never loaded by the plain job reads. */
  findProofOfDelivery(jobId: JobId, stop?: number): Promise<StoredProofOfDelivery | null>;
  /** Deletes a company's proof photos taken before `cutoff`; returns how many went. */
  deleteProofOfDeliveryOlderThan(companyId: CompanyId, cutoff: Date): Promise<number>;
  /** Replaces any existing signature for this delivery stop: taking it again replaces, not appends. */
  saveSignature(jobId: JobId, stop: number, signature: DeliverySignature): Promise<void>;
  /** The signature for a delivery stop, or the latest when no stop is given; `null` if none was taken. */
  findSignature(jobId: JobId, stop?: number): Promise<StoredDeliverySignature | null>;
  /** Deletes a company's signatures taken before `cutoff` (the same retention as photos); returns how many went. */
  deleteSignaturesOlderThan(companyId: CompanyId, cutoff: Date): Promise<number>;
}
