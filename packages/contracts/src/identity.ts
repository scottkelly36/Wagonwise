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
  /** What the driver likes to be called. Absent until they give one. */
  name: z.string().optional(),
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

/** `POST /staff/invite-codes/batch`: several fresh codes at once (for a group of testers). At most 50 a time. */
export const MAX_INVITE_CODES_AT_ONCE = 50;
export const createInviteCodesRequestSchema = z.object({
  count: z.number().int().min(1).max(MAX_INVITE_CODES_AT_ONCE),
});
export type CreateInviteCodesRequest = z.infer<typeof createInviteCodesRequestSchema>;

export const verifyOtpResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  driver: driverSchema,
});
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>;

/** The driver sets the name their companies see them by. Empty clears it; over 60 characters is refused. */
export const setDriverNameRequestSchema = z.object({
  name: z.string().max(200),
});
export type SetDriverNameRequest = z.infer<typeof setDriverNameRequestSchema>;

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

// ---- Email and password sign-in (docs/driver-sign-in-plan.md) ------------------------------------------------
// The routes exist in core only when DRIVER_PASSWORD_SIGN_IN is on. Each answers with `verifyOtpResponseSchema` (tokens and the
// driver) where it signs someone in.

/** The shortest and longest password. Length is the only rule. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** Step 1 of signing up: an emailed code. `inviteCode` only while codes are required. */
export const signupRequestRequestSchema = z.object({
  email: z.string(),
  inviteCode: z.string().optional(),
});
export type SignupRequestRequest = z.infer<typeof signupRequestRequestSchema>;

/** Step 2: the code and the chosen password, which makes the account and signs in. */
export const confirmSignupRequestSchema = z.object({
  email: z.string(),
  password: z.string().max(1024),
  code: z.string(),
  inviteCode: z.string().optional(),
});
export type ConfirmSignupRequest = z.infer<typeof confirmSignupRequestSchema>;

/** Step 1 of signing in: a right password sends a code. */
export const passwordSignInRequestSchema = z.object({
  identifier: z.string(),
  password: z.string().max(1024),
});
export type PasswordSignInRequest = z.infer<typeof passwordSignInRequestSchema>;

/** Step 2 of signing in: the code. */
export const passwordVerifyRequestSchema = z.object({
  identifier: z.string(),
  code: z.string(),
});
export type PasswordVerifyRequest = z.infer<typeof passwordVerifyRequestSchema>;

export const passwordResetRequestRequestSchema = z.object({ email: z.string() });
export type PasswordResetRequestRequest = z.infer<typeof passwordResetRequestRequestSchema>;

export const passwordResetConfirmRequestSchema = z.object({
  email: z.string(),
  code: z.string(),
  newPassword: z.string().max(1024),
});
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmRequestSchema>;

/** A signed-in driver with no password adds one. */
export const setPasswordRequestSchema = z.object({ password: z.string().max(1024) });
export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

/**
 * `GET /identity/sign-in-options`: which ways in the server has switched on, so the app shows only those. `passwordSignIn` is
 * `DRIVER_PASSWORD_SIGN_IN` (sign-up, password and code, forgot password); `inviteRequired` is `DRIVER_INVITE_REQUIRED`; `google` and
 * `apple` are true when that provider has a client id set (and password sign-in is on).
 */
export const signInOptionsSchema = z.object({
  passwordSignIn: z.boolean(),
  inviteRequired: z.boolean(),
  google: z.boolean(),
  apple: z.boolean(),
});
export type SignInOptions = z.infer<typeof signInOptionsSchema>;

// ---- Google and Apple sign-in ------------------------------------------------------------------------------------

export const SOCIAL_PROVIDERS = ['google', 'apple'] as const;
export const socialProviderSchema = z.enum(SOCIAL_PROVIDERS);
export type SocialProvider = z.infer<typeof socialProviderSchema>;

/**
 * `POST /identity/social/sign-in`: the ID token the phone got from Google or Apple. Answers with `verifyOtpResponseSchema` (tokens and
 * the driver). `inviteCode` only while codes are required.
 */
export const socialSignInRequestSchema = z.object({
  provider: socialProviderSchema,
  idToken: z.string().min(1).max(16_384),
  inviteCode: z.string().optional(),
});
export type SocialSignInRequest = z.infer<typeof socialSignInRequestSchema>;

// ---- Adding sign-in methods to the account a driver already has ---------------------------------------------------
// All need a signed-in driver. The confirm-email route answers with the updated driver (`driverSchema`).

/** `POST /identity/account/link/social`: add a Google or Apple login to this account. Answers 204. */
export const linkSocialRequestSchema = z.object({
  provider: socialProviderSchema,
  idToken: z.string().min(1).max(16_384),
});
export type LinkSocialRequest = z.infer<typeof linkSocialRequestSchema>;

/** `POST /identity/account/email/request`: add an email to an account made with a phone number; emails a code to it. */
export const addEmailRequestSchema = z.object({ email: z.string() });
export type AddEmailRequest = z.infer<typeof addEmailRequestSchema>;

/** `POST /identity/account/email/confirm`: the code; the email then becomes the account's sign-in. */
export const confirmEmailRequestSchema = z.object({ email: z.string(), code: z.string() });
export type ConfirmEmailRequest = z.infer<typeof confirmEmailRequestSchema>;
