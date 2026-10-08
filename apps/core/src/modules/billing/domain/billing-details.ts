import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type StaffId = Id<'StaffId'>;

/** WagonWise's own details, printed on every invoice it sends. One record, edited by WagonWise admins. */
export interface BillingDetails {
  readonly tradingName: string;
  readonly address: string;
  readonly contactEmail: string;
  readonly paymentDetails: string;
  readonly vatStatus: string;
  readonly paymentTerms: string;
}

export type BillingField = keyof BillingDetails;

export const BILLING_FIELDS: readonly BillingField[] = [
  'tradingName',
  'address',
  'contactEmail',
  'paymentDetails',
  'vatStatus',
  'paymentTerms',
];

/** Mirrors the column checks in migration 0039 and `BILLING_FIELD_MAX` in the contracts package. */
export const MAX_LENGTH: Readonly<Record<BillingField, number>> = {
  tradingName: 120,
  address: 400,
  contactEmail: 200,
  paymentDetails: 400,
  vatStatus: 200,
  paymentTerms: 200,
};

export interface InvalidBillingDetails extends TaggedError<'InvalidBillingDetails'> {
  readonly fields: readonly BillingField[];
}

/** Trims every field; refuses an empty one or one over its length, naming them. */
export function validateBillingDetails(
  raw: BillingDetails,
): Result<BillingDetails, InvalidBillingDetails> {
  const trimmed: BillingDetails = {
    tradingName: raw.tradingName.trim(),
    address: raw.address.trim(),
    contactEmail: raw.contactEmail.trim(),
    paymentDetails: raw.paymentDetails.trim(),
    vatStatus: raw.vatStatus.trim(),
    paymentTerms: raw.paymentTerms.trim(),
  };
  const bad = BILLING_FIELDS.filter(
    (f) => trimmed[f].length === 0 || trimmed[f].length > MAX_LENGTH[f],
  );
  return bad.length > 0 ? err({ tag: 'InvalidBillingDetails', fields: bad }) : ok(trimmed);
}

/**
 * The fields still holding a [bracketed] placeholder, as the database is seeded. Invoices must not be
 * issued while this is not empty, so "[Trading name]" cannot reach a customer.
 */
export function placeholderFields(details: BillingDetails): BillingField[] {
  return BILLING_FIELDS.filter((f) => /\[[^\]]*\]/.test(details[f]));
}
