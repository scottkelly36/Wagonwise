import type { Collection, CollectionStatus, PaymentCustomer } from '../../domain/payment-event.js';

export interface PaymentCustomerRepository {
  get(companyId: string): Promise<PaymentCustomer | null>;
  /** Creates the row or updates it. `detailsOnFile` left out keeps what is there (false for a new row). */
  upsert(input: {
    readonly companyId: string;
    readonly provider: string;
    readonly providerRef?: string | null | undefined;
    readonly detailsOnFile?: boolean | undefined;
    readonly at: Date;
  }): Promise<void>;
}

export interface CollectionRepository {
  /** Records an open attempt. False when the invoice already has one: nothing is added. */
  open(
    collection: Collection & { readonly providerRef?: string | null | undefined },
  ): Promise<boolean>;
  /** Closes the invoice's open attempt as paid or failed, if there is one. */
  settle(
    invoiceId: string,
    status: Exclude<CollectionStatus, 'requested'>,
    at: Date,
    failureReason?: string,
  ): Promise<void>;
  /** The company's latest attempts, newest first. */
  listForCompany(companyId: string, limit: number): Promise<readonly Collection[]>;
}

export interface ProcessedEventRepository {
  has(eventId: string): Promise<boolean>;
  add(eventId: string, kind: string, at: Date): Promise<void>;
}
