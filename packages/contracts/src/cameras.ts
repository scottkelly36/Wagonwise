import { z } from 'zod';
import { geoPointSchema, routeCameraSchema } from './routing.js';

/**
 * `POST /cameras/nearby`: the speed and red-light cameras around a point or a map view (positions from OpenStreetMap, ©
 * OpenStreetMap contributors, ODbL; not complete, and no mobile cameras). `corridor` is one point, or several for a line.
 */
export const findNearbyCamerasRequestSchema = z.object({
  corridor: z.array(geoPointSchema).min(1).max(2000),
  radiusM: z.number().positive().max(50_000),
});
export type FindNearbyCamerasRequest = z.infer<typeof findNearbyCamerasRequestSchema>;

export const findNearbyCamerasResponseSchema = z.object({ cameras: z.array(routeCameraSchema) });
export type FindNearbyCamerasResponse = z.infer<typeof findNearbyCamerasResponseSchema>;
