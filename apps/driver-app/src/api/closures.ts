import {
  findNearbyClosuresResponseSchema,
  type FindNearbyClosuresRequest,
  type FindNearbyClosuresResponse,
} from '@wagonwise/contracts/closures';

import { requestJson, throwUnlessSuccess } from './http';

/** The road and lane closures near a point, from National Highways' feed (motorways and major A roads only). */
export async function findNearbyClosures(
  accessToken: string,
  input: FindNearbyClosuresRequest,
): Promise<FindNearbyClosuresResponse> {
  const { status, json } = await requestJson('POST', '/closures/nearby', {
    body: input,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return findNearbyClosuresResponseSchema.parse(json);
}
