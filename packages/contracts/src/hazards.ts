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

/** Design doc §7 step 3: the app sends a raw transcript, no location — the `HazardParser` port
 *  only classifies what was said; the pin still uses the GPS position the app captured when
 *  recording started (step 5), which never leaves the device until the driver actually confirms
 *  and files the report via `reportHazardRequestSchema` above. */
export const parseVoiceHazardReportRequestSchema = z.object({
  transcript: z.string().min(1),
});
export type ParseVoiceHazardReportRequest = z.infer<typeof parseVoiceHazardReportRequestSchema>;

/** `positionHint` is free text in Phase 1 (design doc §7 step 5) — nothing resolves it to a
 *  location, so it has no counterpart on `hazardReportSchema` above. */
export const parsedVoiceHazardReportSchema = z.object({
  type: hazardTypeSchema,
  note: z.string().optional(),
  measurement: measurementSchema.optional(),
  positionHint: z.string().optional(),
});
export type ParsedVoiceHazardReportDto = z.infer<typeof parsedVoiceHazardReportSchema>;

/** Powers the driver app's map markers — `corridor` is one point for "near me", several (a route
 *  polyline) for "near my route". Bounded generously rather than tightly: a real HGV route's
 *  decoded polyline can run to hundreds of vertices, and this is a read query, not a write. */
export const findNearbyHazardsRequestSchema = z.object({
  corridor: z.array(geoPointSchema).min(1).max(2000),
  radiusM: z.number().positive().max(50_000),
});
export type FindNearbyHazardsRequest = z.infer<typeof findNearbyHazardsRequestSchema>;

export const findNearbyHazardsResponseSchema = z.object({
  hazards: z.array(hazardReportSchema),
});
export type FindNearbyHazardsResponse = z.infer<typeof findNearbyHazardsResponseSchema>;

/** The shape of a domain error body every hazards route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status; this describes what rides along with it) — mirrors identity's
 *  and routing's own error response schemas. */
export const hazardsErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type HazardsErrorResponse = z.infer<typeof hazardsErrorResponseSchema>;
