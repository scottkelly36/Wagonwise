import {
  driverSchema,
  listDriversResponseSchema,
  requestOtpRequestSchema,
  updateDriverRequestSchema,
  verifyOtpRequestSchema,
  verifyOtpResponseSchema,
  type DriverDto,
  type UpdateDriverRequest,
  type VerifyOtpResponse,
} from '@wagonwise/contracts/identity';

import { requestJson, throwUnlessSuccess } from './http';

/** No inviteCode field — an admin dashboard user is always an existing `Driver` (created via the
 *  driver app's own sign-up), never a first-time sign-up. */
export async function requestOtp(identifier: string): Promise<void> {
  const body = requestOtpRequestSchema.parse({ identifier });
  const { status, json } = await requestJson('POST', '/identity/otp/request', { body });
  throwUnlessSuccess(status, json, [200]);
}

export async function verifyOtp(identifier: string, code: string): Promise<VerifyOtpResponse> {
  const body = verifyOtpRequestSchema.parse({ identifier, code });
  const { status, json } = await requestJson('POST', '/identity/otp/verify', { body });
  throwUnlessSuccess(status, json, [200]);
  return verifyOtpResponseSchema.parse(json);
}

export async function listDrivers(accessToken: string): Promise<DriverDto[]> {
  const { status, json } = await requestJson('GET', '/identity/drivers', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listDriversResponseSchema.parse(json).drivers;
}

export async function updateDriver(
  accessToken: string,
  id: string,
  input: UpdateDriverRequest,
): Promise<DriverDto> {
  const body = updateDriverRequestSchema.parse(input);
  const { status, json } = await requestJson('PATCH', `/identity/drivers/${id}`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return driverSchema.parse(json);
}
