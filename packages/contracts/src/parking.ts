import { z } from 'zod';
import { brandedId } from './brand.js';
import { driverIdSchema } from './identity.js';
import { geoPointSchema } from './routing.js';

export const safeParkingSpotIdSchema = brandedId<'SafeParkingSpotId'>();
export type SafeParkingSpotId = z.infer<typeof safeParkingSpotIdSchema>;

const NOTE_MAX_LENGTH = 280;

/** Who a spot came from: a driver's report, WagonWise staff, or the one-off OpenStreetMap import. */
export const PARKING_SOURCES = ['driver', 'admin', 'osm'] as const;
export const parkingSourceSchema = z.enum(PARKING_SOURCES);
export type ParkingSource = z.infer<typeof parkingSourceSchema>;

/**
 * What sort of place it is: a lorry park, truck stop, service area or a spot a driver or staff vouched for (`parking`), or a
 * roadside lay-by nobody has checked suits a lorry (`layby`). The map shows them as separate layers.
 */
export const PARKING_KINDS = ['parking', 'layby'] as const;
export const parkingKindSchema = z.enum(PARKING_KINDS);
export type ParkingKind = z.infer<typeof parkingKindSchema>;

/** What a driver wants to know before pulling in. Absent means nobody has said, which is not the same as "no". */
export const PARKING_FACILITIES = [
  'paid',
  'toilets',
  'showers',
  'shop',
  'food',
  'fuel',
  'lit',
  'secure',
] as const;
export type ParkingFacility = (typeof PARKING_FACILITIES)[number];

const facilityFields = {
  paid: z.boolean().optional(),
  toilets: z.boolean().optional(),
  showers: z.boolean().optional(),
  shop: z.boolean().optional(),
  food: z.boolean().optional(),
  fuel: z.boolean().optional(),
  lit: z.boolean().optional(),
  secure: z.boolean().optional(),
};

const NAME_MAX_LENGTH = 120;

export const safeParkingSpotSchema = z.object({
  id: safeParkingSpotIdSchema,
  /** Present only for a spot a driver reported. */
  reporterId: driverIdSchema.optional(),
  location: geoPointSchema,
  note: z.string().max(NOTE_MAX_LENGTH).optional(),
  reportedAt: z.iso.datetime(),
  /** Absent on an answer from an older server: read it as a driver's report. */
  source: parkingSourceSchema.optional(),
  /** Absent on an answer from an older server: read it as a parking spot. */
  kind: parkingKindSchema.optional(),
  name: z.string().max(NAME_MAX_LENGTH).optional(),
  capacity: z.number().int().min(0).optional(),
  ...facilityFields,
  /** When anyone last vouched for it. The latest report wins. */
  lastReportedAt: z.iso.datetime().optional(),
  /** How many different drivers have reported this place. */
  reporterCount: z.number().int().min(0).optional(),
  /** The newest notes drivers left, newest first. Every note is kept on the server; this is the latest few. */
  recentNotes: z.array(z.string().max(NOTE_MAX_LENGTH)).max(5).optional(),
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

/**
 * `GET /staff/parking/spots` (WagonWise staff only): the spots, newest first, narrowed by a search of the name and note and
 * by where they came from.
 */
export const listParkingSpotsQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  source: parkingSourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ListParkingSpotsQuery = z.infer<typeof listParkingSpotsQuerySchema>;

export const listParkingSpotsResponseSchema = z.object({
  spots: z.array(safeParkingSpotSchema),
  /** How many match, which can be more than are returned. */
  total: z.number().int().min(0),
  /** How many spots there are of each source, whatever the search. */
  bySource: z.object({
    driver: z.number().int().min(0),
    admin: z.number().int().min(0),
    osm: z.number().int().min(0),
  }),
});
export type ListParkingSpotsResponse = z.infer<typeof listParkingSpotsResponseSchema>;

/**
 * `POST /staff/parking/spots` (adds one) and `PUT /staff/parking/spots/:id` (replaces what staff may set on one). A
 * facility left out is saved as "not known". A spot a driver reported keeps its reporter and source.
 */
export const saveParkingSpotRequestSchema = z.object({
  kind: parkingKindSchema.optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  name: z.string().trim().max(NAME_MAX_LENGTH).optional(),
  note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
  capacity: z.number().int().min(0).max(5000).optional(),
  ...facilityFields,
});
export type SaveParkingSpotRequest = z.infer<typeof saveParkingSpotRequestSchema>;
