import {
  deviceSchema,
  driverSchema,
  refreshTokenRequestSchema,
  refreshTokenResponseSchema,
  registerDeviceRequestSchema,
  requestOtpRequestSchema,
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

export async function refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponse> {
  const body = refreshTokenRequestSchema.parse({ refreshToken });
  const { status, json } = await requestJson('POST', '/identity/token/refresh', { body });
  throwUnlessSuccess(status, json, [200]);
  return refreshTokenResponseSchema.parse(json);
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

/** Design doc §9's "a way for a tester to delete their account and data" (M8). */
export async function deleteAccount(accessToken: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', '/identity/account', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}
