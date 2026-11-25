import type { PaymentEvent } from '../../domain/payment-event.js';

export type ReadEventResult =
  /** Genuine. `event` is null for a message that is real but not one WagonWise acts on. */
  | { readonly ok: true; readonly event: PaymentEvent | null }
  /** Not signed by the provider (or too old): refuse it and read nothing else. */
  | { readonly ok: false };

/**
 * The payment provider (Stripe is the recommendation; docs/company-account-states-scope.md): it holds the payment method on its own hosted
 * page, so card and bank numbers never touch WagonWise, collects the amount core says is due, and tells core by message whether it was
 * paid or failed. WagonWise does not use the provider's own subscription product: plans, vehicle capacity and invoices stay in core.
 */
export interface PaymentProvider {
  readonly name: string;
  /** False when no provider is connected: the portal offers nothing and every route that needs one says so. */
  readonly available: boolean;
  /** A hosted page where a company adds payment details, and where to come back to. Nothing is charged by this. */
  createSetupSession(input: {
    readonly companyId: string;
    readonly companyName: string;
    readonly returnUrl: string;
    /** The provider's id for this company if it already has one (from an earlier visit), so it is reused, not made again. */
    readonly existingRef?: string | null | undefined;
  }): Promise<{ readonly url: string; readonly providerRef?: string | undefined }>;
  /** Asks the provider to collect an issued invoice's total from the company's payment method. The outcome arrives by message. */
  collect(input: {
    readonly companyId: string;
    readonly invoiceId: string;
    readonly invoiceNumber: string | undefined;
    readonly amountPence: number;
    /** WagonWise's id for this attempt: asking twice with the same one must not charge twice. */
    readonly attemptId: string;
    /** The provider's id for the company, as kept when its details were added. */
    readonly customerRef: string | null;
  }): Promise<{ readonly providerRef?: string | undefined }>;
  /** Checks a message the provider sent (`body` is the exact text received, `signature` its signature header) and says what it is. */
  readEvent(input: {
    readonly body: string;
    readonly signature: string | undefined;
    readonly now: Date;
  }): ReadEventResult;
}
