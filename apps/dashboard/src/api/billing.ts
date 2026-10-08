import {
  addCostRequestSchema,
  addInvoiceLineRequestSchema,
  changeCostRequestSchema,
  costSchema,
  financeReportSchema,
  stopCostRequestSchema,
  billingDetailsSchema,
  generateInvoicesRequestSchema,
  generateInvoicesResponseSchema,
  invoiceSchema,
  listInvoicesResponseSchema,
  ownPlanSchema,
  listPlansResponseSchema,
  scheduleCapacityRequestSchema,
  setPriceRequestSchema,
  updateBillingDetailsRequestSchema,
  type AddCostRequest,
  type AddInvoiceLineRequest,
  type ChangeCostRequest,
  type CostDto,
  type FinanceReportDto,
  type BillingDetailsDto,
  type GenerateInvoicesRequest,
  type GenerateInvoicesResponse,
  type InvoiceDto,
  type OwnPlanDto,
  type PlanSummaryDto,
  type ScheduleCapacityRequest,
  type SetPriceRequest,
  type UpdateBillingDetailsRequest,
} from '@wagonwise/contracts/billing';

import { requestJson, throwUnlessSuccess } from './http';

/** WagonWise's own billing details, printed on invoices (WagonWise admins only; core checks). */
export async function getBillingDetails(accessToken: string): Promise<BillingDetailsDto> {
  const { status, json } = await requestJson('GET', '/staff/billing/details', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return billingDetailsSchema.parse(json);
}

export async function updateBillingDetails(
  accessToken: string,
  input: UpdateBillingDetailsRequest,
): Promise<BillingDetailsDto> {
  const body = updateBillingDetailsRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', '/staff/billing/details', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return billingDetailsSchema.parse(json);
}

/** Every company with its price per vehicle, today's capacity and the next scheduled change. */
export async function listPlans(accessToken: string): Promise<PlanSummaryDto[]> {
  const { status, json } = await requestJson('GET', '/staff/billing/companies', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listPlansResponseSchema.parse(json).plans;
}

/** From `effectiveFrom` (today or later), the company's plan covers `capacity` vehicles. */
export async function scheduleCapacity(
  accessToken: string,
  companyId: string,
  input: ScheduleCapacityRequest,
): Promise<void> {
  const body = scheduleCapacityRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'POST',
    `/staff/billing/companies/${companyId}/capacity`,
    { body, authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [201]);
}

export async function setPricePerVehicle(
  accessToken: string,
  companyId: string,
  input: SetPriceRequest,
): Promise<void> {
  const body = setPriceRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/billing/companies/${companyId}/price`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
}

export async function listInvoices(accessToken: string): Promise<InvoiceDto[]> {
  const { status, json } = await requestJson('GET', '/staff/billing/invoices', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listInvoicesResponseSchema.parse(json).invoices;
}

/** Drafts the month's invoices for every company that has something to bill and none yet. */
export async function generateInvoices(
  accessToken: string,
  input: GenerateInvoicesRequest,
): Promise<GenerateInvoicesResponse> {
  const body = generateInvoicesRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/staff/billing/invoices/generate', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return generateInvoicesResponseSchema.parse(json);
}

async function invoiceCall(
  accessToken: string,
  method: 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<InvoiceDto> {
  const { status, json } = await requestJson(method, path, {
    ...(body === undefined ? {} : { body }),
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return invoiceSchema.parse(json);
}

export function addInvoiceLine(
  accessToken: string,
  invoiceId: string,
  input: AddInvoiceLineRequest,
): Promise<InvoiceDto> {
  return invoiceCall(
    accessToken,
    'POST',
    `/staff/billing/invoices/${invoiceId}/lines`,
    addInvoiceLineRequestSchema.parse(input),
  );
}

export function removeInvoiceLine(
  accessToken: string,
  invoiceId: string,
  lineId: string,
): Promise<InvoiceDto> {
  return invoiceCall(accessToken, 'DELETE', `/staff/billing/invoices/${invoiceId}/lines/${lineId}`);
}

export const issueInvoice = (accessToken: string, id: string) =>
  invoiceCall(accessToken, 'POST', `/staff/billing/invoices/${id}/issue`);
export const markInvoicePaid = (accessToken: string, id: string) =>
  invoiceCall(accessToken, 'POST', `/staff/billing/invoices/${id}/paid`);
export const voidInvoice = (accessToken: string, id: string) =>
  invoiceCall(accessToken, 'POST', `/staff/billing/invoices/${id}/void`);

export async function deleteDraftInvoice(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/billing/invoices/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}

/** The signed-in company's own plan (needs `manage_billing`; core checks). */
export async function getOwnPlan(accessToken: string): Promise<OwnPlanDto> {
  const { status, json } = await requestJson('GET', '/staff/billing/my/plan', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return ownPlanSchema.parse(json);
}

/** The signed-in company's issued, paid and cancelled invoices. */
export async function listOwnInvoices(accessToken: string): Promise<InvoiceDto[]> {
  const { status, json } = await requestJson('GET', '/staff/billing/my/invoices', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listInvoicesResponseSchema.parse(json).invoices;
}

/** WagonWise's own finances for a month (this one when left out): twelve months of revenue against costs, the
 *  month in detail, and a look ahead. */
export async function getFinanceReport(
  accessToken: string,
  month?: string,
): Promise<FinanceReportDto> {
  const query = month === undefined ? '' : `?month=${month}`;
  const { status, json } = await requestJson('GET', `/staff/billing/finance${query}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return financeReportSchema.parse(json);
}

export async function addCost(accessToken: string, input: AddCostRequest): Promise<CostDto> {
  const body = addCostRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/staff/billing/costs', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return costSchema.parse(json);
}

/** The new values from `input.fromMonth` on; earlier months keep what they had. */
export async function changeCost(
  accessToken: string,
  id: string,
  input: ChangeCostRequest,
): Promise<CostDto> {
  const body = changeCostRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/billing/costs/${id}`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return costSchema.parse(json);
}

export async function stopCost(accessToken: string, id: string, fromMonth: string): Promise<void> {
  const body = stopCostRequestSchema.parse({ fromMonth });
  const { status, json } = await requestJson('POST', `/staff/billing/costs/${id}/stop`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}

export async function deleteCost(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/billing/costs/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}
