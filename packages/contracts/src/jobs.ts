import { z } from 'zod';
import { brandedId } from './brand.js';
import { companyIdSchema } from './companies.js';
import { geoPointSchema } from './routing.js';

export const jobIdSchema = brandedId<'JobId'>();
export type JobId = z.infer<typeof jobIdSchema>;

export const jobStopSchema = z.object({
  kind: z.enum(['pickup', 'delivery']),
  name: z.string().min(1),
  location: geoPointSchema,
  windowFrom: z.iso.datetime().optional(),
  windowTo: z.iso.datetime().optional(),
  notes: z.string().optional(),
});
export type JobStopDto = z.infer<typeof jobStopSchema>;

export const jobStatusSchema = z.enum([
  'draft',
  'assigned',
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
  'delivered',
  'cancelled',
  'failed',
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobTimelineEntrySchema = z.object({
  status: jobStatusSchema,
  at: z.iso.datetime(),
  position: geoPointSchema.optional(),
});

export const jobSchema = z.object({
  id: jobIdSchema,
  companyId: companyIdSchema,
  reference: z.string(),
  stops: z.array(jobStopSchema),
  status: jobStatusSchema,
  timeline: z.array(jobTimelineEntrySchema),
  plannedStart: z.iso.datetime().optional(),
  dueBy: z.iso.datetime().optional(),
});
export type JobDto = z.infer<typeof jobSchema>;

/** No `id` field (unlike companies' own create request) — a job isn't created from an offline
 *  queue, so there's no idempotency reason to let the client pick the id; core's own
 *  `IdGenerator` does, same as fleet's `createFleetVehicleRequestSchema`. At least one pickup and
 *  one delivery stop (domain's own `validateStops`); the server re-validates regardless. */
export const createJobRequestSchema = z.object({
  companyId: companyIdSchema,
  reference: z.string().min(1),
  stops: z.array(jobStopSchema).min(1),
  plannedStart: z.iso.datetime().optional(),
  dueBy: z.iso.datetime().optional(),
});
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

export const jobCompanyIdParamsSchema = z.object({
  companyId: z.uuid(),
});
export type JobCompanyIdParams = z.infer<typeof jobCompanyIdParamsSchema>;

/** The shape of a domain error body every jobs route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status) — mirrors every other module's own error response schema. */
export const jobsErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type JobsErrorResponse = z.infer<typeof jobsErrorResponseSchema>;
