import { z } from 'zod';
import { brandedId } from './brand.js';

export const companyIdSchema = brandedId<'CompanyId'>();
export type CompanyId = z.infer<typeof companyIdSchema>;

export const companySchema = z.object({
  id: companyIdSchema,
  name: z.string(),
  createdAt: z.iso.datetime(),
});
export type CompanyDto = z.infer<typeof companySchema>;

/** `id` is client-generated, same offline-queue-idempotency reasoning as every other
 *  create-request schema in this package (decision 62) — though this one's always created from
 *  an always-online admin dashboard, not an offline driver queue, so the reasoning is really just
 *  consistency, not a genuine idempotency need here. */
export const createCompanyRequestSchema = z.object({
  id: companyIdSchema,
  name: z.string().min(1),
});
export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;

/** How long a company's proof-of-delivery photos are kept, in months. The company chooses (it is the controller of
 *  its delivery records); the default is 12. */
export const PHOTO_RETENTION_MONTHS_MIN = 1;
export const PHOTO_RETENTION_MONTHS_MAX = 120;
export const companySettingsSchema = z.object({
  photoRetentionMonths: z.number().int().min(PHOTO_RETENTION_MONTHS_MIN).max(PHOTO_RETENTION_MONTHS_MAX),
});
export type CompanySettingsDto = z.infer<typeof companySettingsSchema>;
/** `PUT /staff/companies/:id/settings` takes the same fields. */
export const updateCompanySettingsRequestSchema = companySettingsSchema;
export const companySettingsParamsSchema = z.object({ id: companyIdSchema });

export const listCompaniesResponseSchema = z.object({
  companies: z.array(companySchema),
});
export type ListCompaniesResponse = z.infer<typeof listCompaniesResponseSchema>;

/** The shape of a domain error body every companies route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status) — mirrors identity's, hazards' and every other module's own
 *  error response schema. */
export const companiesErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type CompaniesErrorResponse = z.infer<typeof companiesErrorResponseSchema>;
