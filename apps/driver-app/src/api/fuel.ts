import {
  findNearbyFuelResponseSchema,
  type FindNearbyFuelRequest,
  type FindNearbyFuelResponse,
} from '@wagonwise/contracts/fuel';

import { requestJson, throwUnlessSuccess } from './http';

/** The cheapest stations around a point for one fuel, with when each price was reported (from GOV.UK Fuel Finder). */
export async function findNearbyFuel(
  accessToken: string,
  input: FindNearbyFuelRequest,
): Promise<FindNearbyFuelResponse> {
  const { status, json } = await requestJson('POST', '/fuel/nearby', {
    body: input,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return findNearbyFuelResponseSchema.parse(json);
}
