import { z } from 'zod';
import { geoPointSchema } from './routing.js';

/** The Met Office's colours, in rising order of severity. */
export const weatherWarningLevelSchema = z.enum(['yellow', 'amber', 'red']);
export type WeatherWarningLevel = z.infer<typeof weatherWarningLevelSchema>;

/** What the warning is for. `other` covers anything the Met Office adds that we do not draw an icon for. */
export const weatherWarningKindSchema = z.enum([
  'wind',
  'rain',
  'snow',
  'ice',
  'fog',
  'thunderstorm',
  'heat',
  'other',
]);
export type WeatherWarningKind = z.infer<typeof weatherWarningKindSchema>;

export const weatherWarningSchema = z.object({
  id: z.string(),
  level: weatherWarningLevelSchema,
  kinds: z.array(weatherWarningKindSchema),
  headline: z.string(),
  /** The Met Office's longer text, when it has any. */
  details: z.string().optional(),
  validFrom: z.iso.datetime(),
  validTo: z.iso.datetime(),
  /** The regions the warning covers, as the Met Office names them. */
  areas: z.array(z.string()),
});
export type WeatherWarningDto = z.infer<typeof weatherWarningSchema>;

/** GeoJSON `MultiPolygon` coordinates: polygons, each a list of rings (the first the outline, the rest
 *  holes), each a list of `[longitude, latitude]`. */
export const weatherAreaSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
});
export type WeatherAreaDto = z.infer<typeof weatherAreaSchema>;

/** `GET /staff/weather/warnings`: every warning in force or coming up, with its area for the map. */
export const weatherWarningsWithAreasResponseSchema = z.object({
  warnings: z.array(weatherWarningSchema.extend({ area: weatherAreaSchema })),
  /** When core last heard from the Met Office; absent until the first successful fetch. */
  updatedAt: z.iso.datetime().optional(),
});
export type WeatherWarningsWithAreasResponse = z.infer<
  typeof weatherWarningsWithAreasResponseSchema
>;

/** `POST /weather/warnings/at`: the warnings whose area contains a point. */
export const warningsAtRequestSchema = z.object({ location: geoPointSchema });
export const warningsAtResponseSchema = z.object({ warnings: z.array(weatherWarningSchema) });
export type WarningsAtResponse = z.infer<typeof warningsAtResponseSchema>;

/** What the Met Office's licence asks us to show wherever its data appears. */
export const WEATHER_ATTRIBUTION = 'Contains Met Office data © Crown copyright';
