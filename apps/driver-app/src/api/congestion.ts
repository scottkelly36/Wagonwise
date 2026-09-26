import {
  congestionReportSchema,
  findNearbyCongestionResponseSchema,
  reportCongestionRequestSchema,
  type CongestionReportDto,
  type FindNearbyCongestionRequest,
  type ReportCongestionRequest,
} from '@wagonwise/contracts/congestion';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

export async function reportCongestion(
  accessToken: string,
  input: ReportCongestionRequest,
): Promise<CongestionReportDto> {
  const body = reportCongestionRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/congestion/reports', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return congestionReportSchema.parse(json);
}

/** Powers the map markers, same reasoning as hazards' own `findNearbyHazards` — `input.corridor`
 *  is one point for "near me" (home screen, Phase 1's only consumer for now). */
export async function findNearbyCongestion(
  accessToken: string,
  input: FindNearbyCongestionRequest,
): Promise<CongestionReportDto[]> {
  const { status, json } = await requestJson('POST', '/congestion/reports/nearby', {
    body: input,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return findNearbyCongestionResponseSchema.parse(json).reports;
}
