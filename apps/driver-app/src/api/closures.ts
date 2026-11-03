import {
  findClosuresAlongRouteResponseSchema,
  findNearbyClosuresResponseSchema,
  type FindClosuresAlongRouteRequest,
  type FindClosuresAlongRouteResponse,
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

/** The closures that lie along a planned route (its decoded line), with their lines, for the route screen to check against. */
export async function findClosuresAlongRoute(
  accessToken: string,
  input: FindClosuresAlongRouteRequest,
): Promise<FindClosuresAlongRouteResponse> {
  const { status, json } = await requestJson('POST', '/closures/along-route', {
    body: input,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return findClosuresAlongRouteResponseSchema.parse(json);
}
