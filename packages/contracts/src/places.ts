import { z } from 'zod';
import { brandedId } from './brand.js';
import { companyIdSchema } from './companies.js';
import { geoPointSchema } from './routing.js';

/** A saved place: somewhere a driver has marked, such as the real gate of a farm whose postcode lands
 *  somewhere else, kept for future jobs. A company's driver marks it for the whole company; a driver with
 *  no company marks a personal one, with no `companyId`, that only they see. */
export const savedPlaceIdSchema = brandedId<'SavedPlaceId'>();
export type SavedPlaceId = z.infer<typeof savedPlaceIdSchema>;

export const placeCategorySchema = z.enum(['farm', 'yard', 'other']);
export type PlaceCategory = z.infer<typeof placeCategorySchema>;

export const PLACE_NAME_MAX = 80;
export const PLACE_NOTE_MAX = 500;

export const savedPlaceSchema = z.object({
  id: savedPlaceIdSchema,
  companyId: companyIdSchema.optional(),
  category: placeCategorySchema,
  name: z.string(),
  /** Anything the next driver should know: which gate, a tight turn, who to ask for. */
  note: z.string().optional(),
  location: geoPointSchema,
  /** Visible to every WagonWise driver (never with who marked it). Only a driver's own personal place can be. */
  isPublic: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SavedPlaceDto = z.infer<typeof savedPlaceSchema>;

/** `POST /places` (a driver) and `POST /staff/places/companies/:companyId/places`. `id` is chosen by the
 *  app, so a retry after a dropped connection does not make a second place. */
export const markPlaceRequestSchema = z.object({
  id: savedPlaceIdSchema,
  /** Absent means a personal place (a driver with no company). */
  companyId: companyIdSchema.optional(),
  category: placeCategorySchema,
  name: z.string().min(1).max(PLACE_NAME_MAX),
  note: z.string().max(PLACE_NOTE_MAX).optional(),
  location: geoPointSchema,
});
export type MarkPlaceRequest = z.infer<typeof markPlaceRequestSchema>;

/** Change what a place is called, its category or its note. The spot itself is not edited: to move it,
 *  delete it and mark it again. */
export const updatePlaceRequestSchema = z
  .object({
    name: z.string().min(1).max(PLACE_NAME_MAX).optional(),
    category: placeCategorySchema.optional(),
    /** An empty string clears the note. */
    note: z.string().max(PLACE_NOTE_MAX).optional(),
  })
  .refine((v) => v.name !== undefined || v.category !== undefined || v.note !== undefined, {
    message: 'nothing to change',
  });
export type UpdatePlaceRequest = z.infer<typeof updatePlaceRequestSchema>;

/** `POST /places/:id/share`: a driver who has joined a company shares one of their personal places with it. */
export const sharePlaceRequestSchema = z.object({ companyId: companyIdSchema });
export type SharePlaceRequest = z.infer<typeof sharePlaceRequestSchema>;

/** `PUT /places/:id/visibility`: the owner of a personal place makes it visible to every driver, or private again. */
export const placeVisibilityRequestSchema = z.object({ isPublic: z.boolean() });
export type PlaceVisibilityRequest = z.infer<typeof placeVisibilityRequestSchema>;

/** `POST /places/public/nearby`: the public places within `radiusM` of a point, from every driver. */
export const nearbyPublicPlacesRequestSchema = z.object({
  location: geoPointSchema,
  radiusM: z.number().positive().max(50_000),
});
export type NearbyPublicPlacesRequest = z.infer<typeof nearbyPublicPlacesRequestSchema>;

export const placeReportReasonSchema = z.enum([
  'wrong_place',
  'offensive',
  'private_property',
  'other',
]);
export type PlaceReportReasonDto = z.infer<typeof placeReportReasonSchema>;

/** `POST /places/:id/report`: a driver reports someone else's public place. */
export const reportPlaceRequestSchema = z.object({ reason: placeReportReasonSchema });
export type ReportPlaceRequest = z.infer<typeof reportPlaceRequestSchema>;

/** A public place that drivers have reported, for a WagonWise moderator: the place, how many different drivers reported it and why.
 *  Never who marked it or who reported it. `hidden` is true once enough have reported that other drivers no longer see it. */
export const reportedPlaceSchema = z.object({
  place: savedPlaceSchema,
  reportCount: z.number().int().positive(),
  hidden: z.boolean(),
  reasons: z.array(
    z.object({ reason: placeReportReasonSchema, count: z.number().int().positive() }),
  ),
});
export type ReportedPlaceDto = z.infer<typeof reportedPlaceSchema>;

export const listReportedPlacesResponseSchema = z.object({ places: z.array(reportedPlaceSchema) });
export type ListReportedPlacesResponse = z.infer<typeof listReportedPlacesResponseSchema>;

/** `POST /staff/places/:id/moderate`: `keep` leaves a reported place public and clears its reports (it shows again if it was hidden);
 *  `make_private` takes it off the public map, back to its owner alone, and clears the reports. */
export const moderatePlaceRequestSchema = z.object({ decision: z.enum(['keep', 'make_private']) });
export type ModeratePlaceRequest = z.infer<typeof moderatePlaceRequestSchema>;

export const placeIdParamsSchema = z.object({ id: z.uuid() });
export type PlaceIdParams = z.infer<typeof placeIdParamsSchema>;

export const placesCompanyParamsSchema = z.object({ companyId: z.uuid() });

/** `POST /places/nearby`: the company's places within `radiusM` of a point (a stop, the driver). */
export const nearbyPlacesRequestSchema = z.object({
  /** Absent means the driver's own personal places. */
  companyId: companyIdSchema.optional(),
  location: geoPointSchema,
  radiusM: z.number().positive().max(50_000),
});
export type NearbyPlacesRequest = z.infer<typeof nearbyPlacesRequestSchema>;

/** `POST /places/list`: every place the driver's company has (a driver's list is theirs by company). */
export const listPlacesRequestSchema = z.object({ companyId: companyIdSchema.optional() });
export type ListPlacesRequest = z.infer<typeof listPlacesRequestSchema>;

export const listPlacesResponseSchema = z.object({ places: z.array(savedPlaceSchema) });
export type ListPlacesResponse = z.infer<typeof listPlacesResponseSchema>;

export const placesErrorResponseSchema = z.object({ tag: z.string(), requestId: z.string() });
export type PlacesErrorResponse = z.infer<typeof placesErrorResponseSchema>;
