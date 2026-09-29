import {
  findNearbyHazardsResponseSchema,
  type HazardReportDto,
} from '@wagonwise/contracts/hazards';

import { requestJson, throwUnlessSuccess } from './http';

// Same response shape as findNearbyHazardsRequestSchema's own `{ hazards: [...] }` — reused
// rather than duplicated, since `GET /staff/hazard-reports` (list-all, WagonWise admins only)
// returns identical hazardReportSchema rows, just unfiltered by location.
export async function listHazards(accessToken: string): Promise<HazardReportDto[]> {
  const { status, json } = await requestJson('GET', '/staff/hazard-reports', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return findNearbyHazardsResponseSchema.parse(json).hazards;
}

export async function deleteHazard(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/hazard-reports/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}
