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
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  routePlanId: z.string().optional(),
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

export const listJobsResponseSchema = z.object({
  jobs: z.array(jobSchema),
});
export type ListJobsResponse = z.infer<typeof listJobsResponseSchema>;

/** `GET /jobs/current` (P2-M5.1): the one job a driver is on right now, or `null`. */
export const currentJobResponseSchema = z.object({
  job: jobSchema.nullable(),
});
export type CurrentJobResponse = z.infer<typeof currentJobResponseSchema>;

/** The driver and vehicle must both belong to the job's company; core checks. */
export const assignJobRequestSchema = z.object({
  driverId: z.string().min(1),
  vehicleId: z.string().min(1),
});
export type AssignJobRequest = z.infer<typeof assignJobRequestSchema>;

/** One step forward; `position` is the GPS fix to stamp on the change, when there is one. */
export const advanceJobStatusRequestSchema = z.object({
  status: jobStatusSchema,
  position: geoPointSchema.optional(),
});
export type AdvanceJobStatusRequest = z.infer<typeof advanceJobStatusRequestSchema>;

export const failJobRequestSchema = z.object({
  position: geoPointSchema.optional(),
});
export type FailJobRequest = z.infer<typeof failJobRequestSchema>;

export const jobIdParamsSchema = z.object({
  id: z.uuid(),
});
export type JobIdParams = z.infer<typeof jobIdParamsSchema>;
