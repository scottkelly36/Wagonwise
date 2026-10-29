import { z } from 'zod';
import { geoPointSchema } from './routing.js';

/** The grades GOV.UK Fuel Finder reports. A lorry runs on `B7_STANDARD`, which is the default below. */
export const FUEL_TYPES = ['E10', 'E5', 'B7_STANDARD', 'B7_PREMIUM', 'B10', 'HVO'] as const;
export const fuelTypeSchema = z.enum(FUEL_TYPES);
export type FuelTypeDto = z.infer<typeof fuelTypeSchema>;

/** At most this many stations in one answer, and the number asked for when the request says none. */
export const MAX_FUEL_STATIONS = 50;
export const DEFAULT_FUEL_STATIONS = 20;

/**
 * `POST /fuel/nearby`: the cheapest stations around a point for one fuel. Prices are pence per litre from GOV.UK Fuel Finder, as
 * reported by the retailers: many report rarely, so every price carries when it was reported. `maxAgeDays` leaves out older ones;
 * without it nothing is left out for age.
 */
export const findNearbyFuelRequestSchema = z.object({
  centre: geoPointSchema,
  radiusM: z.number().positive().max(50_000),
  fuelType: fuelTypeSchema.default('B7_STANDARD'),
  maxAgeDays: z.number().int().min(1).max(90).optional(),
  limit: z.number().int().min(1).max(MAX_FUEL_STATIONS).default(DEFAULT_FUEL_STATIONS),
});
export type FindNearbyFuelRequest = z.input<typeof findNearbyFuelRequestSchema>;

export const fuelStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().optional(),
  addressLine: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  phone: z.string().optional(),
  location: geoPointSchema,
  isMotorway: z.boolean(),
  isSupermarket: z.boolean(),
  amenities: z.array(z.string()),
  /** The price of the fuel asked for, in pence per litre (198.9 is £1.989). */
  pencePerLitre: z.number(),
  /** When the retailer last reported that price. */
  priceUpdatedAt: z.string().datetime(),
  /** Straight-line metres from the centre asked about, not road distance. */
  distanceM: z.number(),
});
export type FuelStationDto = z.infer<typeof fuelStationSchema>;

export const findNearbyFuelResponseSchema = z.object({
  fuelType: fuelTypeSchema,
  /** Cheapest first. */
  stations: z.array(fuelStationSchema),
  /** When WagonWise last fetched the prices; absent before the first fetch, when `stations` is empty. */
  refreshedAt: z.string().datetime().optional(),
});
export type FindNearbyFuelResponse = z.infer<typeof findNearbyFuelResponseSchema>;
