import {
  companySchema,
  companySettingsSchema,
  createCompanyRequestSchema,
  listCompaniesResponseSchema,
  type CompanyDto,
  type CompanySettingsDto,
  type CreateCompanyRequest,
} from '@wagonwise/contracts/companies';

import { requestJson, throwUnlessSuccess } from './http';

export async function createCompany(
  accessToken: string,
  input: CreateCompanyRequest,
): Promise<CompanyDto> {
  const body = createCompanyRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/staff/companies', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return companySchema.parse(json);
}

export async function listCompanies(accessToken: string): Promise<CompanyDto[]> {
  const { status, json } = await requestJson('GET', '/staff/companies', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listCompaniesResponseSchema.parse(json).companies;
}

/** How long the company keeps its delivery photos. */
export async function getCompanySettings(
  accessToken: string,
  companyId: string,
): Promise<CompanySettingsDto> {
  const { status, json } = await requestJson('GET', `/staff/companies/${companyId}/settings`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return companySettingsSchema.parse(json);
}

export async function updateCompanySettings(
  accessToken: string,
  companyId: string,
  settings: CompanySettingsDto,
): Promise<CompanySettingsDto> {
  const body = companySettingsSchema.parse(settings);
  const { status, json } = await requestJson('PUT', `/staff/companies/${companyId}/settings`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return companySettingsSchema.parse(json);
}
