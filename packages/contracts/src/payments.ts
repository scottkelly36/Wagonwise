import { z } from 'zod';

// Payment groundwork (docs/company-account-states-scope.md, "Taking payment"): a company adds payment details on the payment provider's own
// hosted page (so card and bank numbers never reach WagonWise), WagonWise staff ask for an issued invoice to be collected, and the provider
// tells core by message what happened.

/** `GET /staff/payments/status` (a company's billing people): whether details can be added here, and whether they are on file. */
export const paymentStatusSchema = z.object({
  /** False while no payment provider is connected: the portal then offers nothing. */
  available: z.boolean(),
  detailsOnFile: z.boolean(),
});
export type PaymentStatusDto = z.infer<typeof paymentStatusSchema>;

/** `POST /staff/payments/setup`: where to send the person to add payment details. Nothing is charged by it. */
export const startPaymentSetupResponseSchema = z.object({ url: z.url() });
export type StartPaymentSetupResponse = z.infer<typeof startPaymentSetupResponseSchema>;

/** `POST /staff/payments/collect` (WagonWise staff): ask the provider to collect an issued invoice from the company's payment method. */
export const collectInvoiceRequestSchema = z.object({ invoiceId: z.uuid() });
export type CollectInvoiceRequest = z.infer<typeof collectInvoiceRequestSchema>;
export const collectInvoiceResponseSchema = z.object({ amountPence: z.number().int().min(1) });
export type CollectInvoiceResponse = z.infer<typeof collectInvoiceResponseSchema>;

export const paymentCompanyParamsSchema = z.object({ id: z.uuid() });

/** `GET /staff/companies/:id/payments` (WagonWise staff): a company's payment details and the latest attempts to collect from it. */
export const companyPaymentsSchema = z.object({
  available: z.boolean(),
  detailsOnFile: z.boolean(),
  collections: z.array(
    z.object({
      id: z.string(),
      invoiceId: z.string(),
      amountPence: z.number().int(),
      status: z.enum(['requested', 'paid', 'failed']),
      requestedAt: z.iso.datetime(),
      settledAt: z.iso.datetime().nullable(),
      failureReason: z.string().nullable(),
    }),
  ),
});
export type CompanyPaymentsDto = z.infer<typeof companyPaymentsSchema>;

/**
 * `POST /payments/webhook` (core, internal key only): what the public receiver passes on. `body` is the exact text the provider sent and
 * `signature` its signature header, so core can check them; the receiver itself knows nothing about the provider.
 */
export const paymentWebhookRequestSchema = z.object({
  body: z.string().max(1_000_000),
  signature: z.string().max(2000).optional(),
});
export type PaymentWebhookRequest = z.infer<typeof paymentWebhookRequestSchema>;
