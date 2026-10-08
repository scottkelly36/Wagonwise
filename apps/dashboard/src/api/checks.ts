import {
  checkDetailSchema,
  checkPhotoResponseSchema,
  checkTemplateBodySchema,
  checkTemplateSchema,
  createCheckTemplateRequestSchema,
  defectSchema,
  listCheckResultsResponseSchema,
  listCheckTemplatesResponseSchema,
  listDefectsResponseSchema,
  setDefectStatusRequestSchema,
  starterTemplateResponseSchema,
  type CheckDetailDto,
  type CheckPhotoResponse,
  type CheckSummaryDto,
  type CheckTemplateBody,
  type CheckTemplateDto,
  type CreateCheckTemplateRequest,
  type DefectDto,
  type DefectStatus,
  type SetDefectStatusRequest,
} from '@wagonwise/contracts/checks';

import { requestJson, throwUnlessSuccess } from './http';

/** The company's walk-round check lists. */
export async function listCheckTemplates(
  accessToken: string,
  companyId: string,
): Promise<CheckTemplateDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/checks/companies/${companyId}/templates`,
    { authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [200]);
  return listCheckTemplatesResponseSchema.parse(json).templates;
}

/** An example list to start from, with new question ids. */
export async function getStarterTemplate(accessToken: string) {
  const { status, json } = await requestJson('GET', '/staff/checks/starter', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return starterTemplateResponseSchema.parse(json);
}

export async function createCheckTemplate(
  accessToken: string,
  companyId: string,
  input: CreateCheckTemplateRequest,
): Promise<CheckTemplateDto> {
  const body = createCheckTemplateRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'POST',
    `/staff/checks/companies/${companyId}/templates`,
    { body, authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [201]);
  return checkTemplateSchema.parse(json);
}

export async function updateCheckTemplate(
  accessToken: string,
  id: string,
  input: CheckTemplateBody,
): Promise<CheckTemplateDto> {
  const body = checkTemplateBodySchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/checks/templates/${id}`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return checkTemplateSchema.parse(json);
}

/** Hides a list; checks already done keep the questions they were answered against. */
export async function archiveCheckTemplate(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/checks/templates/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}

/** The checks drivers have done between two UK days (both included), newest first. */
export async function listCheckResults(
  accessToken: string,
  companyId: string,
  range: { from: string; to: string },
): Promise<CheckSummaryDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/checks/companies/${companyId}/results?from=${range.from}&to=${range.to}`,
    { authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [200]);
  return listCheckResultsResponseSchema.parse(json).checks;
}

/** One check in full, as it was answered. */
export async function getCheckResult(accessToken: string, id: string): Promise<CheckDetailDto> {
  const { status, json } = await requestJson('GET', `/staff/checks/results/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return checkDetailSchema.parse(json);
}

/** A photo a driver took for one question. */
export async function getCheckPhoto(
  accessToken: string,
  id: string,
  itemId: string,
): Promise<CheckPhotoResponse> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/checks/results/${id}/photos/${encodeURIComponent(itemId)}`,
    { authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [200]);
  return checkPhotoResponseSchema.parse(json);
}

/** The company's defects: with no status, those not yet fixed. */
export async function listDefects(
  accessToken: string,
  companyId: string,
  status?: DefectStatus,
): Promise<DefectDto[]> {
  const query = status === undefined ? '' : `?status=${status}`;
  const response = await requestJson(
    'GET',
    `/staff/checks/companies/${companyId}/defects${query}`,
    { authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(response.status, response.json, [200]);
  return listDefectsResponseSchema.parse(response.json).defects;
}

export async function setDefectStatus(
  accessToken: string,
  id: string,
  input: SetDefectStatusRequest,
): Promise<DefectDto> {
  const body = setDefectStatusRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/checks/defects/${id}/status`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return defectSchema.parse(json);
}
