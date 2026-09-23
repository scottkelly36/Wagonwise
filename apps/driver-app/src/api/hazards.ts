import {
  hazardReportSchema,
  reportHazardRequestSchema,
  type HazardReportDto,
  type ReportHazardRequest,
} from '@wagonwise/contracts/hazards';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

export async function reportHazard(
  accessToken: string,
  input: ReportHazardRequest,
): Promise<HazardReportDto> {
  const body = reportHazardRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/hazards/reports', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return hazardReportSchema.parse(json);
}

export async function getHazard(accessToken: string, id: string): Promise<HazardReportDto> {
  const { status, json } = await requestJson('GET', `/hazards/reports/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return hazardReportSchema.parse(json);
}

export async function confirmHazard(accessToken: string, id: string): Promise<HazardReportDto> {
  const { status, json } = await requestJson('POST', `/hazards/reports/${id}/confirm`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return hazardReportSchema.parse(json);
}

export async function dismissHazard(accessToken: string, id: string): Promise<HazardReportDto> {
  const { status, json } = await requestJson('POST', `/hazards/reports/${id}/dismiss`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return hazardReportSchema.parse(json);
}
