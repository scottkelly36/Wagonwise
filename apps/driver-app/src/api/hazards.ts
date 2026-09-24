import {
  hazardReportSchema,
  parseVoiceHazardReportRequestSchema,
  parsedVoiceHazardReportSchema,
  reportHazardRequestSchema,
  type HazardReportDto,
  type ParsedVoiceHazardReportDto,
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

/** Design doc §7 step 3 — the LLM half of voice reporting (M7.1's endpoint). Only ever classifies
 *  a transcript; filing the report is a separate call to `reportHazard` above, made only once
 *  the driver confirms (M7.3). */
export async function parseVoiceHazardReport(
  accessToken: string,
  transcript: string,
): Promise<ParsedVoiceHazardReportDto> {
  const body = parseVoiceHazardReportRequestSchema.parse({ transcript });
  const { status, json } = await requestJson('POST', '/hazards/voice-reports/parse', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return parsedVoiceHazardReportSchema.parse(json);
}

export async function dismissHazard(accessToken: string, id: string): Promise<HazardReportDto> {
  const { status, json } = await requestJson('POST', `/hazards/reports/${id}/dismiss`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return hazardReportSchema.parse(json);
}
