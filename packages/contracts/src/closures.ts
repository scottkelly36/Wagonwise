import { z } from 'zod';
import { geoPointSchema } from './routing.js';

/** The credit National Highways' licence asks for wherever its data is shown. The app shows it on a closure's details. */
export const CLOSURES_CREDIT = "Powered by National Highways' Transport Data Feeds";

/**
 * `full`: a whole carriageway, slip road or link road is shut. `lane`: lanes (or the hard shoulder) are shut and the road stays
 * open. Narrowed lanes and speed limits are not closures and are not sent.
 */
export const CLOSURE_KINDS = ['full', 'lane'] as const;
export const closureKindSchema = z.enum(CLOSURE_KINDS);
export type ClosureKindDto = z.infer<typeof closureKindSchema>;

/** `active`: in force now. `planned`: starts later. (A paused closure is not sent.) */
export const closureStatusSchema = z.enum(['active', 'planned']);
export type ClosureStatusDto = z.infer<typeof closureStatusSchema>;

/** At most this many closures in one answer, and the number asked for when the request says none. */
export const MAX_CLOSURES = 100;
export const DEFAULT_CLOSURES = 50;
/** Closures starting further ahead than this are not sent, and the number of days asked for when the request says none. */
export const MAX_CLOSURE_LOOKAHEAD_DAYS = 30;
export const DEFAULT_CLOSURE_LOOKAHEAD_DAYS = 7;

/**
 * `POST /closures/nearby`: the closures near a point that a driver could meet, in force now or starting within `withinDays`. They
 * come from National Highways' feed (motorways and major A roads only), refreshed every ten minutes or so.
 */
export const findNearbyClosuresRequestSchema = z.object({
  centre: geoPointSchema,
  radiusM: z.number().positive().max(50_000),
  withinDays: z
    .number()
    .int()
    .min(1)
    .max(MAX_CLOSURE_LOOKAHEAD_DAYS)
    .default(DEFAULT_CLOSURE_LOOKAHEAD_DAYS),
  limit: z.number().int().min(1).max(MAX_CLOSURES).default(DEFAULT_CLOSURES),
});
export type FindNearbyClosuresRequest = z.input<typeof findNearbyClosuresRequestSchema>;

export const closureSchema = z.object({
  id: z.string(),
  kind: closureKindSchema,
  status: closureStatusSchema,
  /** "M56", "A1(M)". */
  road: z.string().optional(),
  /** The feed's own word: "eastBound", "northBound"… */
  direction: z.string().optional(),
  /** What National Highways says to the public. */
  description: z.string(),
  /** Where it is, in words. */
  locationText: z.string().optional(),
  /** Why: the feed's own word ("roadworks", "maintenanceWork"…). */
  cause: z.string().optional(),
  /**
   * The whole window the scheme says it may apply. The feed gives a start and an end, not which nights inside it, so a long window
   * does not mean the road is shut all of it.
   */
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  /** How many lanes are shut, counting the hard shoulder. Zero for most full closures, which list none. */
  lanesClosed: z.number().int().min(0),
  location: geoPointSchema,
  /** Straight-line metres from the centre asked about to the nearest point of the closure. */
  distanceM: z.number(),
  /** When National Highways last changed the record. */
  updatedAt: z.string().datetime(),
});
export type ClosureDto = z.infer<typeof closureSchema>;

export const findNearbyClosuresResponseSchema = z.object({
  /** In force first, then the soonest to start. */
  closures: z.array(closureSchema),
  /** When WagonWise last fetched the closures; absent before the first fetch, when `closures` is empty. */
  refreshedAt: z.string().datetime().optional(),
});
export type FindNearbyClosuresResponse = z.infer<typeof findNearbyClosuresResponseSchema>;
