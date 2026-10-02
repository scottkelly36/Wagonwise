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

// ---------------------------------------------------------------------------------------------
// Driver links (P2-M2): a driver joining a company. See docs/history/p2-m2-driver-links.md.
// ---------------------------------------------------------------------------------------------

export const driverLinkIdSchema = brandedId<'DriverLinkId'>();
export type DriverLinkId = z.infer<typeof driverLinkIdSchema>;

export const driverLinkStatusSchema = z.enum([
  'invited',
  'requested',
  'active',
  'declined',
  'left',
]);
export type DriverLinkStatus = z.infer<typeof driverLinkStatusSchema>;

export const driverLinkSchema = z.object({
  id: driverLinkIdSchema,
  companyId: companyIdSchema,
  /** Present for a request and once an invitation is accepted. */
  driverId: z.string().optional(),
  /** Present on an invitation: the phone or email it was made for. */
  invitedIdentifier: z.string().optional(),
  status: driverLinkStatusSchema,
  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().optional(),
});
export type DriverLinkDto = z.infer<typeof driverLinkSchema>;

export const listDriverLinksResponseSchema = z.object({
  links: z.array(driverLinkSchema),
});
export type ListDriverLinksResponse = z.infer<typeof listDriverLinksResponseSchema>;

/** Staff invite someone by phone number or email; they need not have an account yet. */
export const inviteDriverRequestSchema = z.object({
  identifier: z.string().min(1),
});
export type InviteDriverRequest = z.infer<typeof inviteDriverRequestSchema>;

/** A driver asks to join with a company's code, typed as they have it (spaces and hyphens and
 *  case are ignored by core). The company still has to approve. */
export const joinWithCodeRequestSchema = z.object({
  code: z.string().min(1),
});
export type JoinWithCodeRequest = z.infer<typeof joinWithCodeRequestSchema>;

/** The driver's side of an invitation. */
export const respondToInvitationRequestSchema = z.object({
  accept: z.boolean(),
});
export type RespondToInvitationRequest = z.infer<typeof respondToInvitationRequestSchema>;

/** The company's current join code, shown to staff with the manage_fleet privilege. */
export const companyCodeResponseSchema = z.object({
  code: z.string(),
});
export type CompanyCodeResponse = z.infer<typeof companyCodeResponseSchema>;

export const driverLinkIdParamsSchema = z.object({
  id: z.uuid(),
});
export type DriverLinkIdParams = z.infer<typeof driverLinkIdParamsSchema>;
