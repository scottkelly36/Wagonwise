import { z } from 'zod';
import { brandedId } from './brand.js';
import { driverIdSchema } from './identity.js';
import { geoPointSchema } from './routing.js';

export const safeParkingSpotIdSchema = brandedId<'SafeParkingSpotId'>();
export type SafeParkingSpotId = z.infer<typeof safeParkingSpotIdSchema>;

const NOTE_MAX_LENGTH = 280;

export const safeParkingSpotSchema = z.object({
  id: safeParkingSpotIdSchema,
  reporterId: driverIdSchema,
  location: geoPointSchema,
  note: z.string().max(NOTE_MAX_LENGTH).optional(),
  reportedAt: z.iso.datetime(),
});
export type SafeParkingSpotDto = z.infer<typeof safeParkingSpotSchema>;

/** `id` is client-generated (design doc's offline-queue idempotency pattern, mirrors hazards'/
 *  congestion's own report request schemas) — the reporter is whoever the caller's access token
 *  says they are, taken from the verified token, not this schema. */
/** `DELETE /parking/spots/:id`: a driver taking back a spot they just marked. */
export const safeParkingSpotIdParamsSchema = z.object({ id: z.uuid() });

export const reportSafeParkingSpotRequestSchema = z.object({
  id: safeParkingSpotIdSchema,
  location: geoPointSchema,
  note: z.string().max(NOTE_MAX_LENGTH).optional(),
});
export type ReportSafeParkingSpotRequest = z.infer<typeof reportSafeParkingSpotRequestSchema>;

/** Powers the driver app's map markers — `corridor` is one point for "near me" (home screen),
 *  several (a route polyline) for "near my route", mirroring `findNearbyCongestionRequestSchema`
 *  exactly. */
export const findNearbySafeParkingSpotsRequestSchema = z.object({
  corridor: z.array(geoPointSchema).min(1).max(2000),
  radiusM: z.number().positive().max(50_000),
});
export type FindNearbySafeParkingSpotsRequest = z.infer<
  typeof findNearbySafeParkingSpotsRequestSchema
>;

export const findNearbySafeParkingSpotsResponseSchema = z.object({
  spots: z.array(safeParkingSpotSchema),
});
export type FindNearbySafeParkingSpotsResponse = z.infer<
  typeof findNearbySafeParkingSpotsResponseSchema
>;

/** The shape of a domain error body every parking route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status; this describes what rides along with it) — mirrors every other
 *  module's own error response schema. */
export const parkingErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type ParkingErrorResponse = z.infer<typeof parkingErrorResponseSchema>;
