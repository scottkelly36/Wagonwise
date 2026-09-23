import {
  refreshTokenRequestSchema,
  refreshTokenResponseSchema,
  requestOtpRequestSchema,
  verifyOtpRequestSchema,
  verifyOtpResponseSchema,
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
