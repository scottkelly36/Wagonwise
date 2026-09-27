import {
  companySchema,
  createCompanyRequestSchema,
  listCompaniesResponseSchema,
  type CompanyDto,
  type CreateCompanyRequest,
} from '@wagonwise/contracts/companies';

import { requestJson, throwUnlessSuccess } from './http';

export async function createCompany(
  accessToken: string,
  input: CreateCompanyRequest,
): Promise<CompanyDto> {
  const body = createCompanyRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/companies', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return companySchema.parse(json);
}

export async function listCompanies(accessToken: string): Promise<CompanyDto[]> {
  const { status, json } = await requestJson('GET', '/companies', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listCompaniesResponseSchema.parse(json).companies;
}
