import {
  accountSettingsSchema,
  accountStateSchema,
  companySchema,
  companySettingsSchema,
  createCompanyRequestSchema,
  listCompaniesResponseSchema,
  sendAccountEmailRequestSchema,
  sendAccountEmailResponseSchema,
  setAccountStateRequestSchema,
  ownAccountStateSchema,
  type AccountSettingsDto,
  type AccountStateDto,
  type CompanyDto,
  type OwnAccountStateDto,
  type SendAccountEmailRequest,
  type SendAccountEmailResponse,
  type SetAccountStateRequest,
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

/** WagonWise staff: a company's account state, with the owner's note and hold. */
export async function getAccountState(
  accessToken: string,
  companyId: string,
): Promise<AccountStateDto> {
  const { status, json } = await requestJson('GET', `/staff/companies/${companyId}/account-state`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return accountStateSchema.parse(json);
}

/** WagonWise staff: move a company to a state (trial, active, overdue, paused), or extend a trial, or set the hold. */
export async function setAccountState(
  accessToken: string,
  companyId: string,
  input: SetAccountStateRequest,
): Promise<AccountStateDto> {
  const body = setAccountStateRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/companies/${companyId}/account-state`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return accountStateSchema.parse(json);
}

/**
 * WagonWise staff: write to a company's billing people about its account now (only while it is in the state the email is about), or
 * send oneself a test copy of the wording.
 */
export async function sendAccountEmail(
  accessToken: string,
  companyId: string,
  input: SendAccountEmailRequest,
): Promise<SendAccountEmailResponse> {
  const body = sendAccountEmailRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'POST',
    `/staff/companies/${companyId}/account-emails`,
    {
      body,
      authorization: `Bearer ${accessToken}`,
    },
  );
  throwUnlessSuccess(status, json, [200]);
  return sendAccountEmailResponseSchema.parse(json);
}

/** A company's own staff: the state of their own company, for the banner. */
export async function getOwnAccountState(accessToken: string): Promise<OwnAccountStateDto> {
  const { status, json } = await requestJson('GET', '/staff/company/account-state', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return ownAccountStateSchema.parse(json);
}

/** WagonWise staff: the free period for new companies and the grace period. */
export async function getAccountSettings(accessToken: string): Promise<AccountSettingsDto> {
  const { status, json } = await requestJson('GET', '/staff/account-settings', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return accountSettingsSchema.parse(json);
}

export async function updateAccountSettings(
  accessToken: string,
  settings: AccountSettingsDto,
): Promise<AccountSettingsDto> {
  const body = accountSettingsSchema.parse(settings);
  const { status, json } = await requestJson('PUT', '/staff/account-settings', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return accountSettingsSchema.parse(json);
}
