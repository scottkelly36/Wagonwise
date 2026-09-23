import {
  refreshTokenRequestSchema,
  refreshTokenResponseSchema,
  requestOtpRequestSchema,
  verifyOtpRequestSchema,
  verifyOtpResponseSchema,
  type RefreshTokenResponse,
  type VerifyOtpResponse,
} from '@wagonwise/contracts/identity';

import { config } from '../config';
import { IdentityApiError } from './errors';

interface JsonResponse {
  readonly status: number;
  readonly json: unknown;
}

async function postJson(path: string, body: unknown): Promise<JsonResponse> {
  const response = await fetch(`${config.bffUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: unknown = response.status === 204 ? undefined : await response.json();
  return { status: response.status, json };
}

function throwAsIdentityError(status: number, json: unknown): never {
  const body = json as { tag?: string; attemptsRemaining?: number } | undefined;
  throw new IdentityApiError(body?.tag ?? 'UnknownError', status, body?.attemptsRemaining);
}

/** `undefined` inviteCode means "not entered" — omitted from the request, not sent as null;
 *  only required the first time an identifier signs in (core validates this, not this client). */
export async function requestOtp(identifier: string, inviteCode?: string): Promise<void> {
  const body = requestOtpRequestSchema.parse({ identifier, inviteCode });
  const { status, json } = await postJson('/identity/otp/request', body);
  if (status !== 200) throwAsIdentityError(status, json);
}

export async function verifyOtp(
  identifier: string,
  code: string,
  inviteCode?: string,
): Promise<VerifyOtpResponse> {
  const body = verifyOtpRequestSchema.parse({ identifier, code, inviteCode });
  const { status, json } = await postJson('/identity/otp/verify', body);
  if (status !== 200) throwAsIdentityError(status, json);
  return verifyOtpResponseSchema.parse(json);
}

export async function refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponse> {
  const body = refreshTokenRequestSchema.parse({ refreshToken });
  const { status, json } = await postJson('/identity/token/refresh', body);
  if (status !== 200) throwAsIdentityError(status, json);
  return refreshTokenResponseSchema.parse(json);
}
