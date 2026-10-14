import {
  deviceSchema,
  driverSchema,
  refreshTokenRequestSchema,
  refreshTokenResponseSchema,
  registerDeviceRequestSchema,
  requestOtpRequestSchema,
  setDriverNameRequestSchema,
  verifyOtpRequestSchema,
  verifyOtpResponseSchema,
  type DeviceDto,
  type DriverDto,
  type RefreshTokenResponse,
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
