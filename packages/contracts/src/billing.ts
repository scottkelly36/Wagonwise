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

/** `GET /staff/billing/my/plan`: a company's own plan, for its billing managers (`manage_billing`). */
export const ownPlanSchema = z.object({
  /** Vehicles the plan covers today. */
  capacityToday: z.number().int(),
  /** Vehicles the company has set up now. */
  vehiclesInUse: z.number().int(),
  pricePerVehiclePence: z.number().int(),
  /** Pence for a month at today's capacity. */
  monthlyPence: z.number().int(),
  next: z.object({ effectiveFrom: dayString, capacity: z.number().int() }).optional(),
});
export type OwnPlanDto = z.infer<typeof ownPlanSchema>;
// `GET /staff/billing/my/invoices` replies with `listInvoicesResponseSchema`: issued, paid and cancelled only.

// ---------------------------------------------------------------------------------------------
// WagonWise's own finances: what it costs to run, against what the companies are invoiced.

export const COST_CATEGORIES = [
  'hosting',
  'maps',
  'messaging',
  'software',
  'wages',
  'other',
] as const;
export const costCategorySchema = z.enum(COST_CATEGORIES);
export type CostCategoryDto = z.infer<typeof costCategorySchema>;

const monthString2 = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** A cost WagonWise carries. It applies from `fromMonth` and every month after until `toMonth` (absent: for ever). */
export const costSchema = z.object({
  id: z.string(),
  category: costCategorySchema,
  description: z.string(),
  amountPence: z.number().int(),
  fromMonth: monthString2,
  toMonth: monthString2.optional(),
});
export type CostDto = z.infer<typeof costSchema>;

export const costFieldsSchema = z.object({
  category: costCategorySchema,
  description: z.string().trim().min(1).max(120),
  amountPence: z.number().int().min(0).max(100_000_000),
});

/** `POST /staff/billing/costs`: from `fromMonth` on, every month, or just that month when `oneOff`. */
export const addCostRequestSchema = costFieldsSchema.extend({
  fromMonth: monthString2,
  oneOff: z.boolean(),
});
export type AddCostRequest = z.infer<typeof addCostRequestSchema>;

/** `PUT /staff/billing/costs/:id`: the new values from `fromMonth` on; earlier months keep what they had. */
export const changeCostRequestSchema = costFieldsSchema.extend({ fromMonth: monthString2 });
export type ChangeCostRequest = z.infer<typeof changeCostRequestSchema>;

/** `POST /staff/billing/costs/:id/stop`: it last applies the month before `fromMonth`. */
export const stopCostRequestSchema = z.object({ fromMonth: monthString2 });
export type StopCostRequest = z.infer<typeof stopCostRequestSchema>;

export const costIdParamsSchema = z.object({ id: z.string().min(1) });

export const monthFiguresSchema = z.object({
  month: monthString2,
  invoicedPence: z.number().int(),
  receivedPence: z.number().int(),
  costsPence: z.number().int(),
  profitInvoicedPence: z.number().int(),
  profitReceivedPence: z.number().int(),
});
export type MonthFiguresDto = z.infer<typeof monthFiguresSchema>;

/** `GET /staff/billing/finance?month=YYYY-MM` (this month when left out). */
export const financeQuerySchema = z.object({ month: monthString2.optional() });

export const financeReportSchema = z.object({
  /** The twelve months ending at `month`, oldest first. */
  months: z.array(monthFiguresSchema),
  month: monthString2,
  currentMonth: monthString2,
  /** The costs in force in `month`. */
  costs: z.array(costSchema),
  revenueByCompany: z.array(
    z.object({
      companyId: z.string(),
      name: z.string(),
      invoicedPence: z.number().int(),
      receivedPence: z.number().int(),
    }),
  ),
  projection: z.object({
    monthlyRevenuePence: z.number().int(),
    monthlyCostsPence: z.number().int(),
    projectedProfitPence: z.number().int(),
    vehiclesCovered: z.number().int(),
    averagePricePence: z.number().int(),
    breakEvenVehicles: z.number().int().nullable(),
  }),
});
export type FinanceReportDto = z.infer<typeof financeReportSchema>;
