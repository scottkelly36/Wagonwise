import { z } from 'zod';

/** WagonWise's own billing details, printed on invoices. Edited by WagonWise admins only. */
export const BILLING_FIELD_MAX = {
  tradingName: 120,
  address: 400,
  contactEmail: 200,
  paymentDetails: 400,
  vatStatus: 200,
  paymentTerms: 200,
} as const;

const field = (max: number) => z.string().trim().min(1).max(max);

export const billingDetailsFieldsSchema = z.object({
  tradingName: field(BILLING_FIELD_MAX.tradingName),
  address: field(BILLING_FIELD_MAX.address),
  contactEmail: field(BILLING_FIELD_MAX.contactEmail),
  paymentDetails: field(BILLING_FIELD_MAX.paymentDetails),
  vatStatus: field(BILLING_FIELD_MAX.vatStatus),
  paymentTerms: field(BILLING_FIELD_MAX.paymentTerms),
});
export type BillingDetailsFields = z.infer<typeof billingDetailsFieldsSchema>;

/** `PUT /staff/billing/details` */
export const updateBillingDetailsRequestSchema = billingDetailsFieldsSchema;
export type UpdateBillingDetailsRequest = z.infer<typeof updateBillingDetailsRequestSchema>;

/** `GET /staff/billing/details` and the reply to the `PUT`. `placeholders` names the fields that still
 *  hold a [bracketed] placeholder; while it is not empty, invoices cannot be issued. */
export const billingDetailsSchema = billingDetailsFieldsSchema.extend({
  placeholders: z.array(z.string()),
  updatedAt: z.iso.datetime(),
});
export type BillingDetailsDto = z.infer<typeof billingDetailsSchema>;
