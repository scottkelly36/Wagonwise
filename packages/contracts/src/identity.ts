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
});
export type DriverDto = z.infer<typeof driverSchema>;

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

/** The shape of a domain error body every identity route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status; this describes what rides along with it). */
export const identityErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type IdentityErrorResponse = z.infer<typeof identityErrorResponseSchema>;
