import {
  checkTemplateBodySchema,
  checkTemplateSchema,
  createCheckTemplateRequestSchema,
  listCheckTemplatesResponseSchema,
  starterTemplateResponseSchema,
  type CheckTemplateBody,
  type CheckTemplateDto,
  type CreateCheckTemplateRequest,
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
