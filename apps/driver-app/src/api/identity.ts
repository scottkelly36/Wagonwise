import {
  addEmailRequestSchema,
  confirmEmailRequestSchema,
  confirmSignupRequestSchema,
  deviceSchema,
  driverSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestRequestSchema,
  passwordSignInRequestSchema,
  passwordVerifyRequestSchema,
  refreshTokenRequestSchema,
  refreshTokenResponseSchema,
  registerDeviceRequestSchema,
  requestOtpRequestSchema,
  setDriverNameRequestSchema,
  setPasswordRequestSchema,
  signInOptionsSchema,
  signupRequestRequestSchema,
  verifyOtpRequestSchema,
  verifyOtpResponseSchema,
  type DeviceDto,
  type DriverDto,
  type RefreshTokenResponse,
  type SignInOptions,
  type VerifyOtpResponse,
} from '@wagonwise/contracts/identity';

import { requestJson, throwUnlessSuccess } from './http';

/** `undefined` inviteCode means "not entered" — omitted from the request, not sent as null;
 *  only required the first time an identifier signs in (core validates this, not this client). */
export async function requestOtp(identifier: string, inviteCode?: string): Promise<void> {
  const body = requestOtpRequestSchema.parse({ identifier, inviteCode });
  const { status, json } = await requestJson('POST', '/identity/otp/request', { body });
  throwUnlessSuccess(status, json, [200]);
}

export async function verifyOtp(
  identifier: string,
  code: string,
  inviteCode?: string,
): Promise<VerifyOtpResponse> {
  const body = verifyOtpRequestSchema.parse({ identifier, code, inviteCode });
  const { status, json } = await requestJson('POST', '/identity/otp/verify', { body });
  throwUnlessSuccess(status, json, [200]);
  return verifyOtpResponseSchema.parse(json);
}

const refreshesInFlight = new Map<string, Promise<RefreshTokenResponse>>();

/**
 * Swaps a refresh token for a new pair. Calls made with the same token while one is already on its way share that one request:
 * the server swaps the token on use, so a second call with the same token would look like someone replaying a stolen one.
 */
export function refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponse> {
  const existing = refreshesInFlight.get(refreshToken);
  if (existing !== undefined) return existing;
  const request = (async () => {
    const body = refreshTokenRequestSchema.parse({ refreshToken });
    const { status, json } = await requestJson('POST', '/identity/token/refresh', { body });
    throwUnlessSuccess(status, json, [200]);
    return refreshTokenResponseSchema.parse(json);
  })().finally(() => refreshesInFlight.delete(refreshToken));
  refreshesInFlight.set(refreshToken, request);
  return request;
}

export async function registerDevice(accessToken: string, pushToken: string): Promise<DeviceDto> {
  const body = registerDeviceRequestSchema.parse({ pushToken });
  const { status, json } = await requestJson('POST', '/identity/devices', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return deviceSchema.parse(json);
}

/** Design doc §9's privacy notice/consent screen (M8) — returns the updated driver so the caller
 *  can update `auth-store`'s cached copy without a separate refetch. */
export async function giveConsent(accessToken: string): Promise<DriverDto> {
  const { status, json } = await requestJson('POST', '/identity/consent', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return driverSchema.parse(json);
}

/** The name companies see this driver by. Empty clears it. Returns the updated driver so the caller can update
 *  `auth-store`'s cached copy. */
export async function setDriverName(accessToken: string, name: string): Promise<DriverDto> {
  const body = setDriverNameRequestSchema.parse({ name });
  const { status, json } = await requestJson('PUT', '/identity/name', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return driverSchema.parse(json);
}

/** Design doc §9's "a way for a tester to delete their account and data" (M8). */
export async function deleteAccount(accessToken: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', '/identity/account', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}

// ---- Email and password sign-in (docs/driver-sign-in-plan.md). The server answers these only when it has switched them on;
// `getSignInOptions` says whether it has.

/** Which ways in the server offers. Asked before anyone signs in, so the screen shows only what will work. */
export async function getSignInOptions(): Promise<SignInOptions> {
  const { status, json } = await requestJson('GET', '/identity/sign-in-options');
  throwUnlessSuccess(status, json, [200]);
  return signInOptionsSchema.parse(json);
}

/** Sign-up step 1: emails a code to the address. `inviteCode` only while the server still asks for one. */
export async function requestSignup(email: string, inviteCode?: string): Promise<void> {
  const body = signupRequestRequestSchema.parse({ email, inviteCode });
  const { status, json } = await requestJson('POST', '/identity/signup/request', { body });
  throwUnlessSuccess(status, json, [200]);
}

/** Sign-up step 2: the code and the chosen password make the account and sign in. */
export async function confirmSignup(input: {
  readonly email: string;
  readonly password: string;
  readonly code: string;
  readonly inviteCode?: string | undefined;
}): Promise<VerifyOtpResponse> {
  const body = confirmSignupRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/identity/signup/confirm', { body });
  throwUnlessSuccess(status, json, [200]);
  return verifyOtpResponseSchema.parse(json);
}

/** Sign-in step 1: a right password sends a code. A wrong email or password is one `InvalidCredentials`. */
export async function passwordSignIn(identifier: string, password: string): Promise<void> {
  const body = passwordSignInRequestSchema.parse({ identifier, password });
  const { status, json } = await requestJson('POST', '/identity/password/sign-in', { body });
  throwUnlessSuccess(status, json, [200]);
}

/** Sign-in step 2: the code. */
export async function passwordVerify(identifier: string, code: string): Promise<VerifyOtpResponse> {
  const body = passwordVerifyRequestSchema.parse({ identifier, code });
  const { status, json } = await requestJson('POST', '/identity/password/verify', { body });
  throwUnlessSuccess(status, json, [200]);
  return verifyOtpResponseSchema.parse(json);
}

/** Forgot password, step 1: emails a code. The server answers 200 whether or not there is such an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  const body = passwordResetRequestRequestSchema.parse({ email });
  const { status, json } = await requestJson('POST', '/identity/password/reset/request', { body });
  throwUnlessSuccess(status, json, [200]);
}

/** Forgot password, step 2: the code and a new password. Signs in, and the server ends the driver's other sessions. */
export async function confirmPasswordReset(input: {
  readonly email: string;
  readonly code: string;
  readonly newPassword: string;
}): Promise<VerifyOtpResponse> {
  const body = passwordResetConfirmRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/identity/password/reset/confirm', { body });
  throwUnlessSuccess(status, json, [200]);
  return verifyOtpResponseSchema.parse(json);
}

/** A signed-in driver with no password adds one. `PasswordAlreadySet` if they have one. */
export async function setPassword(accessToken: string, password: string): Promise<void> {
  const body = setPasswordRequestSchema.parse({ password });
  const { status, json } = await requestJson('PUT', '/identity/account/password', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}

/** A driver who signed up with a phone number adds an email: emails a code to it. */
export async function requestAddEmail(accessToken: string, email: string): Promise<void> {
  const body = addEmailRequestSchema.parse({ email });
  const { status, json } = await requestJson('POST', '/identity/account/email/request', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
}

/** The code: the email then becomes the account's sign-in. Returns the updated driver for `auth-store`'s cached copy. */
export async function confirmAddEmail(
  accessToken: string,
  email: string,
  code: string,
): Promise<DriverDto> {
  const body = confirmEmailRequestSchema.parse({ email, code });
  const { status, json } = await requestJson('POST', '/identity/account/email/confirm', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return driverSchema.parse(json);
}
