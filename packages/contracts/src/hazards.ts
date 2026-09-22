import { z } from 'zod';
import { brandedId } from './brand.js';
import { driverIdSchema } from './identity.js';
import { geoPointSchema } from './routing.js';

export const hazardReportIdSchema = brandedId<'HazardReportId'>();
export type HazardReportId = z.infer<typeof hazardReportIdSchema>;

export const hazardTypeSchema = z.enum([
  'low_bridge',
  'weight_limit',
  'width_restriction',
  'tight_bend',
  'roadworks',
  'flooding',
  'no_hgv',
  'other',
]);
export type HazardTypeDto = z.infer<typeof hazardTypeSchema>;

export const hazardStatusSchema = z.enum(['active', 'expired', 'dismissed']);
export type HazardStatusDto = z.infer<typeof hazardStatusSchema>;

export const measurementSchema = z.object({
  kind: z.enum(['height', 'width', 'weight']),
  value: z.number().positive(),
  unit: z.enum(['m', 't']),
});
export type MeasurementDto = z.infer<typeof measurementSchema>;

export const reportSourceSchema = z.enum(['tap', 'voice']);
export type ReportSourceDto = z.infer<typeof reportSourceSchema>;

export const hazardReportSchema = z.object({
  id: hazardReportIdSchema,
  reporterId: driverIdSchema,
  type: hazardTypeSchema,
  location: geoPointSchema,
  note: z.string().optional(),
  measurement: measurementSchema.optional(),
  source: reportSourceSchema,
  confirmations: z.number(),
  dismissals: z.number(),
  status: hazardStatusSchema,
  expiresAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
});
export type HazardReportDto = z.infer<typeof hazardReportSchema>;

/** `id` is client-generated (design doc §5) — the offline queue's idempotency key — so it rides
 *  in the request body here, unlike every routing create request, which lets the server assign
 *  one. No `reporterId` field (M4.3): the reporter is whoever the caller's access token says they
 *  are, taken from the verified token, not this schema (decision 1). */
export const reportHazardRequestSchema = z.object({
  id: hazardReportIdSchema,
  type: hazardTypeSchema,
  location: geoPointSchema,
  note: z.string().optional(),
  measurement: measurementSchema.optional(),
  source: reportSourceSchema,
});
export type ReportHazardRequest = z.infer<typeof reportHazardRequestSchema>;

/** The URL `:id` — a plain UUID on the wire, branded once it reaches core's domain (mirrors
 *  routing's vehicleProfileIdParamsSchema). */
export const hazardReportIdParamsSchema = z.object({
  id: z.uuid(),
});
export type HazardReportIdParams = z.infer<typeof hazardReportIdParamsSchema>;

/** The shape of a domain error body every hazards route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status; this describes what rides along with it) — mirrors identity's
 *  and routing's own error response schemas. */
export const hazardsErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type HazardsErrorResponse = z.infer<typeof hazardsErrorResponseSchema>;
