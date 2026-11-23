/** Who a signed-in staff account is, as far as payments cares. Supplied by composition over `companies`. */
export type StaffCaller =
  | { readonly kind: 'platform'; readonly staffId: string }
  | {
      readonly kind: 'fleet';
      readonly staffId: string;
      readonly companyId: string;
      readonly privileges: readonly string[];
    };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

/** What payments needs from `billing`: one invoice, how many are unpaid, and settling one. Supplied by composition over `billing`. */
export interface InvoiceLedger {
  find(invoiceId: string): Promise<{
    readonly id: string;
    readonly companyId: string;
    readonly number: string | undefined;
    readonly status: 'draft' | 'issued' | 'paid' | 'void';
    readonly totalPence: number;
  } | null>;
  countUnpaid(companyId: string): Promise<number>;
  settle(invoiceId: string): Promise<'paid' | 'already_paid' | 'not_found' | 'not_issued'>;
}

/** What payments tells `companies`: a company's account moves (or not) on what the provider says. Supplied by composition over `companies`. */
export interface AccountFacts {
  record(
    companyId: string,
    fact: {
      readonly kind: 'details_added' | 'paid_in_full' | 'payment_failed';
      readonly owesAnything: boolean;
    },
  ): Promise<unknown>;
}

/** The company's name, for the provider's page. Supplied by composition over `companies`. */
export interface CompanyNames {
  nameOf(companyId: string): Promise<string | undefined>;
}

/** A line to the owner (the alert address). Absent when none is set. */
export interface OwnerNotice {
  send(subject: string, text: string): Promise<void>;
}
