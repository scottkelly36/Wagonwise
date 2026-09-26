import { z } from 'zod';
import { brandedId } from './brand.js';
import { driverIdSchema } from './identity.js';
import { geoPointSchema } from './routing.js';

export const congestionReportIdSchema = brandedId<'CongestionReportId'>();
export type CongestionReportId = z.infer<typeof congestionReportIdSchema>;

const ESTIMATED_WAIT_MINUTES_MIN = 1;
const ESTIMATED_WAIT_MINUTES_MAX = 180;

export const congestionReportSchema = z.object({
  id: congestionReportIdSchema,
  reporterId: driverIdSchema,
  location: geoPointSchema,
  estimatedWaitMinutes: z.number().min(ESTIMATED_WAIT_MINUTES_MIN).max(ESTIMATED_WAIT_MINUTES_MAX),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type CongestionReportDto = z.infer<typeof congestionReportSchema>;

/** `id` is client-generated (design doc's offline-queue idempotency pattern, mirrors hazards'
 *  `reportHazardRequestSchema`) — the reporter is whoever the caller's access token says they
 *  are, taken from the verified token, not this schema. */
export const reportCongestionRequestSchema = z.object({
  id: congestionReportIdSchema,
  location: geoPointSchema,
  estimatedWaitMinutes: z.number().min(ESTIMATED_WAIT_MINUTES_MIN).max(ESTIMATED_WAIT_MINUTES_MAX),
});
export type ReportCongestionRequest = z.infer<typeof reportCongestionRequestSchema>;

/** Powers the driver app's map markers — `corridor` is one point for "near me", several (a route
 *  polyline) for "near my route", mirroring `findNearbyHazardsRequestSchema` exactly. */
export const findNearbyCongestionRequestSchema = z.object({
  corridor: z.array(geoPointSchema).min(1).max(2000),
  radiusM: z.number().positive().max(50_000),
});
export type FindNearbyCongestionRequest = z.infer<typeof findNearbyCongestionRequestSchema>;

export const findNearbyCongestionResponseSchema = z.object({
  reports: z.array(congestionReportSchema),
});
export type FindNearbyCongestionResponse = z.infer<typeof findNearbyCongestionResponseSchema>;

/** The shape of a domain error body every congestion route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status; this describes what rides along with it) — mirrors hazards',
 *  identity's and routing's own error response schemas. */
export const congestionErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type CongestionErrorResponse = z.infer<typeof congestionErrorResponseSchema>;
