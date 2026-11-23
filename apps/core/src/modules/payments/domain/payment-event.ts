/**
 * A message from the payment provider, in WagonWise's own words (docs/company-account-states-scope.md, "Taking payment"). The provider's
 * adapter checks the message is genuine and turns it into one of these; everything after that is the same whichever provider it is.
 * `id` is the provider's own id for the message, so one sent twice is acted on once.
 */
export type PaymentEvent =
  /** The company finished adding payment details on the provider's page. */
  | {
      readonly id: string;
      readonly kind: 'setup_completed';
      readonly companyId: string;
      readonly providerRef?: string | undefined;
    }
  /** The payment method was removed at the provider. */
  | { readonly id: string; readonly kind: 'payment_method_removed'; readonly companyId: string }
  /** An invoice was paid: money received. */
  | {
      readonly id: string;
      readonly kind: 'payment_succeeded';
      readonly companyId: string;
      readonly invoiceId: string;
      readonly amountPence: number;
    }
  /** An attempt to collect an invoice failed (and the provider has given up for now). */
  | {
      readonly id: string;
      readonly kind: 'payment_failed';
      readonly companyId: string;
      readonly invoiceId: string;
      readonly reason?: string | undefined;
    };

export type CollectionStatus = 'requested' | 'paid' | 'failed';

/** One attempt to collect an invoice. */
export interface Collection {
  readonly id: string;
  readonly companyId: string;
  readonly invoiceId: string;
  readonly amountPence: number;
  readonly status: CollectionStatus;
  readonly requestedBy: string | null;
  readonly requestedAt: Date;
  readonly settledAt: Date | null;
  readonly failureReason: string | null;
}

/** Whether a company has finished adding payment details, and which provider holds them. */
export interface PaymentCustomer {
  readonly companyId: string;
  readonly provider: string;
  readonly providerRef: string | null;
  readonly detailsOnFile: boolean;
  readonly updatedAt: Date;
}
