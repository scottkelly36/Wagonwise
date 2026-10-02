import { z } from 'zod';
import { brandedId } from './brand.js';

export const driverIdSchema = brandedId<'DriverId'>();
export type DriverId = z.infer<typeof driverIdSchema>;

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
  /** Retired (P2-M1.12c): admin screens are for staff accounts now, and no driver is an admin.
   *  Core always sends `false`; the field stays because released driver-app builds require it. */
  isAdmin: z.boolean(),
  /** Retired with `isAdmin` (P2-M1.12c): core always sends `[]`, for the same released builds.
   *  Staff privileges live on staff accounts (`staff.ts`). */
  scopes: z.array(z.string()),
});
export type DriverDto = z.infer<typeof driverSchema>;

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
