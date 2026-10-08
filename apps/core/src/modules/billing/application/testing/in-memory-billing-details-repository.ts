import type { BillingDetails, StaffId } from '../../domain/billing-details.js';
import type {
  BillingDetailsRepository,
  StoredBillingDetails,
} from '../ports/billing-details-repository.js';

const SEED: BillingDetails = {
  tradingName: '[Trading name]',
  address: '[Address]',
  contactEmail: '[Billing email]',
  paymentDetails: '[Bank details]',
  vatStatus: '[VAT number, or "Not VAT registered"]',
  paymentTerms: '[Payment terms]',
};

/** Starts as the migration seeds it: all placeholders. */
export class InMemoryBillingDetailsRepository implements BillingDetailsRepository {
  #stored: StoredBillingDetails = {
    details: SEED,
    updatedAt: new Date('2026-10-08T00:00:00.000Z'),
  };
  lastUpdatedBy: StaffId | undefined;

  get(): Promise<StoredBillingDetails> {
    return Promise.resolve(this.#stored);
  }

  save(details: BillingDetails, updatedBy: StaffId, at: Date): Promise<void> {
    this.#stored = { details, updatedAt: at };
    this.lastUpdatedBy = updatedBy;
    return Promise.resolve();
  }
}
