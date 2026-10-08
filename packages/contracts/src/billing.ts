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

/** What a company pays for: a price per vehicle (in pence) and the number of vehicles the plan covers. */
export const planCompanyParamsSchema = z.object({ companyId: z.string().min(1) });

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const planSummarySchema = z.object({
  companyId: z.string(),
  name: z.string(),
  pricePerVehiclePence: z.number().int(),
  /** Vehicles the plan covers today. */
  capacityToday: z.number().int(),
  /** The next scheduled change, if any. */
  next: z.object({ effectiveFrom: dayString, capacity: z.number().int() }).optional(),
  /** Pence for a month at today's capacity. */
  monthlyPence: z.number().int(),
});
export type PlanSummaryDto = z.infer<typeof planSummarySchema>;

/** `GET /staff/billing/companies` */
export const listPlansResponseSchema = z.object({ plans: z.array(planSummarySchema) });

/** `PUT /staff/billing/companies/:companyId/price` */
export const setPriceRequestSchema = z.object({
  pricePerVehiclePence: z.number().int().min(0).max(1_000_000),
});
export type SetPriceRequest = z.infer<typeof setPriceRequestSchema>;

/** `POST /staff/billing/companies/:companyId/capacity`: from this day (today or later), the plan covers
 *  this many vehicles. */
export const scheduleCapacityRequestSchema = z.object({
  capacity: z.number().int().min(0).max(10_000),
  effectiveFrom: dayString,
});
export type ScheduleCapacityRequest = z.infer<typeof scheduleCapacityRequestSchema>;

export const capacityChangeSchema = z.object({
  effectiveFrom: dayString,
  capacity: z.number().int(),
});
export type CapacityChangeDto = z.infer<typeof capacityChangeSchema>;

/** `GET /staff/billing/companies/:companyId/capacity`, newest first. */
export const capacityHistoryResponseSchema = z.object({ changes: z.array(capacityChangeSchema) });

/** Invoices WagonWise sends companies. Money is whole pence. */
export const invoiceIdParamsSchema = z.object({ id: z.string().min(1) });
export const invoiceLineParamsSchema = z.object({
  id: z.string().min(1),
  lineId: z.string().min(1),
});

const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const invoiceStatusSchema = z.enum(['draft', 'issued', 'paid', 'void']);
export type InvoiceStatusDto = z.infer<typeof invoiceStatusSchema>;

export const invoiceLineSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number().int(),
  unitPence: z.number().int(),
  amountPence: z.number().int(),
});
export type InvoiceLineDto = z.infer<typeof invoiceLineSchema>;

export const invoiceSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  companyName: z.string(),
  month: monthString,
  status: invoiceStatusSchema,
  /** Absent until issued. */
  number: z.string().optional(),
  lines: z.array(invoiceLineSchema),
  totalPence: z.number().int(),
  createdAt: z.iso.datetime(),
  issuedAt: z.iso.datetime().optional(),
  paidAt: z.iso.datetime().optional(),
  voidedAt: z.iso.datetime().optional(),
  /** WagonWise's details as they stood at issue; absent on a draft. */
  issuedDetails: billingDetailsFieldsSchema.optional(),
});
export type InvoiceDto = z.infer<typeof invoiceSchema>;

/** `GET /staff/billing/invoices`: newest month first. */
export const listInvoicesResponseSchema = z.object({ invoices: z.array(invoiceSchema) });

/** `POST /staff/billing/invoices/generate`: draft the month's invoices. */
export const generateInvoicesRequestSchema = z.object({ month: monthString });
export type GenerateInvoicesRequest = z.infer<typeof generateInvoicesRequestSchema>;
export const generateInvoicesResponseSchema = z.object({
  created: z.array(invoiceSchema),
  skipped: z.array(
    z.object({
      companyId: z.string(),
      name: z.string(),
      reason: z.enum(['already_invoiced', 'nothing_to_bill']),
    }),
  ),
});
export type GenerateInvoicesResponse = z.infer<typeof generateInvoicesResponseSchema>;

/** `POST /staff/billing/invoices/:id/lines`: a credit (negative) or a one-off charge, on a draft. */
export const addInvoiceLineRequestSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amountPence: z.number().int().min(-100_000_000).max(100_000_000),
});
export type AddInvoiceLineRequest = z.infer<typeof addInvoiceLineRequestSchema>;
