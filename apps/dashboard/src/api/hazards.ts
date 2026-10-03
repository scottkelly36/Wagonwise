import {
  findNearbyHazardsResponseSchema,
  moderateHazardRequestSchema,
  moderationDecisionSchema,
  moderationQueueResponseSchema,
  type HazardReportDto,
  type ModerateHazardRequest,
  type ModerationDecisionDto,
  type ModerationQueueResponse,
} from '@wagonwise/contracts/hazards';

export type ModerationQueueItem = ModerationQueueResponse['items'][number];

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

/** Active blocking-type or disputed reports no moderator has approved yet (P2-M7.1). */
export async function listModerationQueue(accessToken: string): Promise<ModerationQueueItem[]> {
  const { status, json } = await requestJson('GET', '/staff/hazard-reports/moderation-queue', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return moderationQueueResponseSchema.parse(json).items;
}

export async function moderateHazard(
  accessToken: string,
  id: string,
  input: ModerateHazardRequest,
): Promise<ModerationDecisionDto> {
  const body = moderateHazardRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/staff/hazard-reports/${id}/moderate`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return moderationDecisionSchema.parse(json);
}
