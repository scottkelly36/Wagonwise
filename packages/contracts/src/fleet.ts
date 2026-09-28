import { z } from 'zod';
import { brandedId } from './brand.js';
import { companyIdSchema } from './companies.js';
import { dimensionsSchema } from './routing.js';

export const fleetVehicleIdSchema = brandedId<'FleetVehicleId'>();
export type FleetVehicleId = z.infer<typeof fleetVehicleIdSchema>;

export const fleetVehicleSchema = z.object({
  id: fleetVehicleIdSchema,
  companyId: companyIdSchema,
  name: z.string(),
  dimensions: dimensionsSchema,
});
export type FleetVehicleDto = z.infer<typeof fleetVehicleSchema>;

/** No `id` field (unlike companies' own create request) — a vehicle isn't created from an
 *  offline queue, so there's no idempotency reason to let the client pick the id; core's own
 *  `IdGenerator` does, same as routing's `createVehicleProfileRequestSchema`. */
export const createFleetVehicleRequestSchema = z.object({
  companyId: companyIdSchema,
  name: z.string().min(1),
  dimensions: dimensionsSchema,
});
export type CreateFleetVehicleRequest = z.infer<typeof createFleetVehicleRequestSchema>;

export const updateFleetVehicleRequestSchema = z.object({
  name: z.string().min(1),
  dimensions: dimensionsSchema,
});
export type UpdateFleetVehicleRequest = z.infer<typeof updateFleetVehicleRequestSchema>;

export const listFleetVehiclesResponseSchema = z.object({
  vehicles: z.array(fleetVehicleSchema),
});
export type ListFleetVehiclesResponse = z.infer<typeof listFleetVehiclesResponseSchema>;

export const fleetVehicleIdParamsSchema = z.object({
  id: z.uuid(),
});
export type FleetVehicleIdParams = z.infer<typeof fleetVehicleIdParamsSchema>;

export const fleetCompanyIdParamsSchema = z.object({
  companyId: z.uuid(),
});
export type FleetCompanyIdParams = z.infer<typeof fleetCompanyIdParamsSchema>;

/** The shape of a domain error body every fleet route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status) — mirrors every other module's own error response schema. */
export const fleetErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type FleetErrorResponse = z.infer<typeof fleetErrorResponseSchema>;
