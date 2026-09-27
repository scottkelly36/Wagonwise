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
