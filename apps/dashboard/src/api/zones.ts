import {
  lowEmissionZonesResponseSchema,
  type LowEmissionZonesResponse,
} from '@wagonwise/contracts/routing';

import { requestJson, throwUnlessSuccess } from './http';

/** Scotland's low emission zones with their outlines, to draw on the live map. The same for every company. */
export async function listLowEmissionZones(accessToken: string): Promise<LowEmissionZonesResponse> {
  const { status, json } = await requestJson('GET', '/staff/routing/low-emission-zones', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return lowEmissionZonesResponseSchema.parse(json);
}
