import {
  driverSchema,
  listDriversResponseSchema,
  updateDriverRequestSchema,
  type DriverDto,
  type UpdateDriverRequest,
} from '@wagonwise/contracts/identity';

import { requestJson, throwUnlessSuccess } from './http';

/** The driver-accounts screen: WagonWise admins only (core decides). */
export async function listDrivers(accessToken: string): Promise<DriverDto[]> {
  const { status, json } = await requestJson('GET', '/staff/drivers', {
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
  const { status, json } = await requestJson('PATCH', `/staff/drivers/${id}`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return driverSchema.parse(json);
}
