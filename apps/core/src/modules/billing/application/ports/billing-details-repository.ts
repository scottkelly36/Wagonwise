import type { BillingDetails, StaffId } from '../../domain/billing-details.js';

export interface StoredBillingDetails {
  readonly details: BillingDetails;
  readonly updatedAt: Date;
}

export interface BillingDetailsRepository {
  /** There is always exactly one record (seeded by migration 0039). */
  get(): Promise<StoredBillingDetails>;
  save(details: BillingDetails, updatedBy: StaffId, at: Date): Promise<void>;
}
