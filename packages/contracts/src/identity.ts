import { z } from 'zod';
import { brandedId } from './brand.js';
import { companyIdSchema } from './companies.js';

export const driverIdSchema = brandedId<'DriverId'>();
export type DriverId = z.infer<typeof driverIdSchema>;

/** A fixed, WagonWise-defined list (Phase 2 tech design doc's decision log, 2026-09-27) — never
 *  freeform text a company could invent. Grants a company-scoped "Fleet user" one extra
 *  capability within their own company; `isAdmin` already bypasses every scope check. */
export const DRIVER_SCOPES = ['manage_fleet'] as const;
export const driverScopeSchema = z.enum(DRIVER_SCOPES);
export type DriverScope = z.infer<typeof driverScopeSchema>;

export const sessionIdSchema = brandedId<'SessionId'>();
export type SessionId = z.infer<typeof sessionIdSchema>;

export const requestOtpRequestSchema = z.object({
  identifier: z.string(),
  /** Required only when no Driver exists yet for this identifier (first sign-in). */
  inviteCode: z.string().optional(),
});
export type RequestOtpRequest = z.infer<typeof requestOtpRequestSchema>;

export const verifyOtpRequestSchema = z.object({
  identifier: z.string(),
  code: z.string(),
  inviteCode: z.string().optional(),
});
export type VerifyOtpRequest = z.infer<typeof verifyOtpRequestSchema>;

export const driverSchema = z.object({
  id: driverIdSchema,
  identifier: z.string(),
  createdAt: z.iso.datetime(),
  /** Design doc §9's privacy notice/consent screen (M8) — absent until the driver accepts it. */
  consentedAt: z.iso.datetime().optional(),
  /** Lets the app hide admin-only actions (e.g. a true hazard delete, 2026-09-26) for anyone who
   *  isn't one, rather than showing the control to every driver and relying on the server's 403
   *  alone. Always present — the domain's own `Driver.isAdmin` is a required boolean, never
   *  unset. */
  isAdmin: z.boolean(),
  /** A driver belongs to at most one company at a time (2026-09-27: "one driver, one company,
   *  but drivers change jobs so they can change companies") — absent until an admin assigns one.
   *  No history of past companies is kept. */
  companyId: companyIdSchema.optional(),
  /** Empty for almost every driver — see `DRIVER_SCOPES`. Always present, same reasoning as
   *  `isAdmin`. */
  scopes: z.array(driverScopeSchema),
});
export type DriverDto = z.infer<typeof driverSchema>;

export const listDriversResponseSchema = z.object({
  drivers: z.array(driverSchema),
});
export type ListDriversResponse = z.infer<typeof listDriversResponseSchema>;

/** Admin-only (core's `identity/interface/routes.ts` gates it). `companyId: null` clears an
 *  existing assignment; omitting the field leaves it unchanged — plain PATCH semantics, not a
 *  reset to "no company" by default. Same for `isAdmin`: omitted means unchanged. */
export const updateDriverRequestSchema = z.object({
  companyId: companyIdSchema.nullable().optional(),
  isAdmin: z.boolean().optional(),
  /** Omitted: unchanged. An array (including `[]`): replaces the whole set, not a merge. */
  scopes: z.array(driverScopeSchema).optional(),
});
export type UpdateDriverRequest = z.infer<typeof updateDriverRequestSchema>;

export const driverIdParamsSchema = z.object({
  id: z.uuid(),
});
export type DriverIdParams = z.infer<typeof driverIdParamsSchema>;

/** The invite-codes admin screen (2026-09-27) — a code is client-opaque, never parsed or
 *  constructed by a caller, so there's no separate branded id schema the way `CompanyId` has
 *  one; `redeemedBy` is `driverIdSchema` since it's a real driver reference once set. */
export const inviteCodeSchema = z.object({
  code: z.string(),
  redeemedBy: driverIdSchema.nullable(),
  redeemedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type InviteCodeDto = z.infer<typeof inviteCodeSchema>;

export const listInviteCodesResponseSchema = z.object({
  inviteCodes: z.array(inviteCodeSchema),
});
export type ListInviteCodesResponse = z.infer<typeof listInviteCodesResponseSchema>;

export const verifyOtpResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  driver: driverSchema,
});
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>;

export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

export const refreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type RefreshTokenResponse = z.infer<typeof refreshTokenResponseSchema>;

export const revokeSessionParamsSchema = z.object({
  id: z.uuid(),
});
export type RevokeSessionParams = z.infer<typeof revokeSessionParamsSchema>;

export const deviceIdSchema = brandedId<'DeviceId'>();
export type DeviceId = z.infer<typeof deviceIdSchema>;

/** No `driverId` field, same reasoning as every other create-request schema in this package —
 *  the caller is whoever the access token says they are. */
export const registerDeviceRequestSchema = z.object({
  pushToken: z.string().min(1),
});
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const deviceSchema = z.object({
  id: deviceIdSchema,
  driverId: driverIdSchema,
  pushToken: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type DeviceDto = z.infer<typeof deviceSchema>;

/** The shape of a domain error body every identity route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status; this describes what rides along with it). */
export const identityErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type IdentityErrorResponse = z.infer<typeof identityErrorResponseSchema>;
