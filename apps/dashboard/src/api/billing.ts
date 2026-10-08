import {
  billingDetailsSchema,
  listPlansResponseSchema,
  scheduleCapacityRequestSchema,
  setPriceRequestSchema,
  updateBillingDetailsRequestSchema,
  type BillingDetailsDto,
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
